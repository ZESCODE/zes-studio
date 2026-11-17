"""Blender previs pass for ZES Studio shorts.

Renders a transparent PNG sequence of a 3D "previs" element that the Remotion
template overlays on top of the flat fact cards:

  * a slowly rotating wireframe globe (the channel's "3D layout" motif)
  * an orbiting satellite marker + latitude/longitude rings
  * a soft rim light so it reads on dark backgrounds

The sequence is deliberately cheap: EEVEE-free Cycles CPU, low samples,
small square frames. Output is a numbered PNG list (frame-000.png ...), which
Remotion loads one file per frame via staticFile().

Usage (inside the Debian proot, where Blender lives):

  blender --background --python blender_previs.py -- \
      --out /path/to/video/public/previs --frames 120 --res 480 --samples 16

Then reference it from a script with `previs: "previs"` and the template
overlays `previs/frame-<n>.png` on the hook and outro scenes.
"""
import argparse
import math
import os
import sys

import bpy
from mathutils import Vector


def parse_args():
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--out", required=True, help="output directory for PNG frames")
    p.add_argument("--frames", type=int, default=120)
    p.add_argument("--res", type=int, default=480)
    p.add_argument("--samples", type=int, default=16)
    p.add_argument("--fps", type=int, default=30)
    return p.parse_args(argv)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_globe(radius=1.0):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=radius)
    globe = bpy.context.object
    globe.name = "PrevisGlobe"

    mat = bpy.data.materials.new("PrevisGlobeMat")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.06, 0.08, 0.16, 1)
    bsdf.inputs["Metallic"].default_value = 0.85
    bsdf.inputs["Roughness"].default_value = 0.28
    globe.data.materials.append(mat)

    # Wireframe shell so it reads as a 3D layout/previs object, not a planet.
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=radius * 1.004)
    shell = bpy.context.object
    shell.name = "PrevisWire"
    wire = bpy.data.materials.new("PrevisWireMat")
    wire.use_nodes = True
    nt = wire.node_tree
    for n in list(nt.nodes):
        if n.type != "OUTPUT_MATERIAL":
            nt.nodes.remove(n)
    out = nt.nodes["Material Output"]
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = (0.29, 0.85, 1.0, 1)
    emit.inputs["Strength"].default_value = 2.4
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])

    wf = shell.modifiers.new("Wire", "WIREFRAME")
    wf.thickness = 0.012
    wf.use_replace = True
    shell.data.materials.append(wire)
    return globe, shell


def make_rings(radius=1.0):
    rings = []
    for i, (rot, tilt) in enumerate([((0, 0, 0), 0.0), ((math.pi / 2.6, 0, 0), 0.0)]):
        bpy.ops.mesh.primitive_torus_add(
            major_radius=radius * 1.45,
            minor_radius=0.006,
            major_segments=96,
            minor_segments=8,
            location=(0, 0, 0),
            rotation=rot,
        )
        ring = bpy.context.object
        ring.name = f"PrevisRing{i}"
        mat = bpy.data.materials.new(f"PrevisRingMat{i}")
        mat.use_nodes = True
        nt = mat.node_tree
        for n in list(nt.nodes):
            if n.type != "OUTPUT_MATERIAL":
                nt.nodes.remove(n)
        out = nt.nodes["Material Output"]
        emit = nt.nodes.new("ShaderNodeEmission")
        emit.inputs["Color"].default_value = (1.0, 0.79, 0.30, 1) if i == 0 else (0.29, 0.85, 1.0, 1)
        emit.inputs["Strength"].default_value = 1.8
        nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
        ring.data.materials.append(mat)
        rings.append(ring)
    return rings


def make_marker(radius=1.0):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.055, location=(radius * 1.45, 0, 0))
    marker = bpy.context.object
    marker.name = "PrevisMarker"
    mat = bpy.data.materials.new("PrevisMarkerMat")
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        if n.type != "OUTPUT_MATERIAL":
            nt.nodes.remove(n)
    out = nt.nodes["Material Output"]
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = (1.0, 0.30, 0.36, 1)
    emit.inputs["Strength"].default_value = 6.0
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    marker.data.materials.append(mat)
    return marker


def setup_scene(res, samples):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False
    sc.cycles.max_bounces = 4
    sc.render.resolution_x = res
    sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.view_settings.view_transform = "Standard"

    world = bpy.data.worlds.new("PrevisWorld")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.01, 0.012, 0.03, 1)
    bg.inputs["Strength"].default_value = 1.0
    sc.world = world
    return sc


def add_lights():
    bpy.ops.object.light_add(type="AREA", location=(3.2, -3.4, 3.0))
    key = bpy.context.object
    key.name = "PrevisKey"
    key.data.energy = 420
    key.data.shape = "DISK"
    key.data.size = 5.0
    key.data.color = (0.55, 0.75, 1.0)

    bpy.ops.object.light_add(type="AREA", location=(-3.4, -2.2, -1.4))
    rim = bpy.context.object
    rim.name = "PrevisRim"
    rim.data.energy = 260
    rim.data.shape = "DISK"
    rim.data.size = 4.0
    rim.data.color = (1.0, 0.72, 0.35)


def add_camera():
    bpy.ops.object.camera_add(location=(0, -5.4, 0.9), rotation=(math.radians(80), 0, 0))
    cam = bpy.context.object
    cam.name = "PrevisCam"
    cam.data.lens = 62
    bpy.context.scene.camera = cam
    return cam


def main():
    args = parse_args()
    os.makedirs(args.out, exist_ok=True)

    reset()
    sc = setup_scene(args.res, args.samples)
    sc.frame_start = 1
    sc.frame_end = args.frames
    sc.render.fps = args.fps

    globe, shell = make_globe()
    rings = make_rings()
    marker = make_marker()

    add_lights()
    add_camera()

    # Slow turntable: the globe spins, the marker orbits with it.
    for f in range(1, args.frames + 1):
        t = (f - 1) / max(1, args.frames - 1)
        ang = t * math.tau
        globe.rotation_euler = (0.0, 0.0, ang * 0.55)
        shell.rotation_euler = (0.0, 0.0, ang * 0.55)
        marker.location = (
            math.cos(ang) * 1.45,
            math.sin(ang) * 1.45,
            math.sin(ang * 2.0) * 0.18,
        )
        for ring in rings:
            ring.rotation_euler = (ring.rotation_euler.x, ring.rotation_euler.y, ang * 0.22)

        sc.frame_set(f)
        sc.render.filepath = os.path.join(args.out, f"frame-{f - 1:03d}.png")
        bpy.ops.render.render(write_still=True)
        if f % 10 == 0:
            print(f"[previs] {f}/{args.frames}", flush=True)

    print(f"[previs] done -> {args.out} ({args.frames} frames)")


if __name__ == "__main__":
    main()