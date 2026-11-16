#!/usr/bin/env python3
"""ZES Studio Blender previs worker.

Run inside Blender (never with plain system Python):

    blender -b --python-exit-code 1 -P previs_build.py -- shot.json /abs/path/renders/previs_<timestamp>.mp4

The script starts from an empty factory scene, builds a ground plane,
placeholder cubes, lights and one animated camera from the shot-spec JSON,
then renders a 640x360 H.264 MP4 to an absolute path. It prints structured
"PROGRESS <n>" lines for the Node job queue and an "OUTPUT <path>" line on
success. Any failure is printed to stderr and exits with a non-zero code.
"""

from __future__ import annotations

import json
import math
import os
import shutil
import sys
import tempfile
import time
import traceback
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
DEFAULT_CUBES: list[dict[str, Any]] = [
    {"name": "Subject_A", "location": [-2.4, 0.0, 1.0], "scale": [0.8, 0.8, 0.8], "color": "#6ee7ff"},
    {"name": "Subject_B", "location": [0.0, 0.2, 1.15], "scale": [1.0, 1.0, 1.0], "color": "#4d8dff"},
    {"name": "Subject_C", "location": [2.4, -0.1, 0.9], "scale": [0.7, 0.7, 0.7], "color": "#ffc94d"},
]

try:
    import bpy  # type: ignore
    from mathutils import Vector  # type: ignore
except Exception as exc:  # pragma: no cover - only hit outside Blender
    print(
        "ERROR: this worker must run inside Blender with `bpy`. "
        f"Import failed: {exc}",
        file=sys.stderr,
        flush=True,
    )
    sys.exit(1)

LAST_PROGRESS = 0
FRAME_TOTAL = 1
RENDERED_FRAMES = 0


def emit(line: str) -> None:
    print(line, flush=True)


def progress(value: int) -> None:
    global LAST_PROGRESS
    pct = max(0, min(100, int(value)))
    if pct <= LAST_PROGRESS:
        return
    LAST_PROGRESS = pct
    emit(f"PROGRESS {pct}")


def fail(message: str) -> None:
    raise RuntimeError(message)


def as_float(value: Any, fallback: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def as_vec3(value: Any, fallback: tuple[float, float, float] = (0.0, 0.0, 0.0)):
    if isinstance(value, dict):
        value = [value.get("x", 0), value.get("y", 0), value.get("z", 0)]
    if hasattr(value, "x") and hasattr(value, "y") and hasattr(value, "z"):
        try:
            return Vector((float(value.x), float(value.y), float(value.z)))
        except (TypeError, ValueError):
            pass
    if isinstance(value, (list, tuple)) and len(value) >= 3:
        try:
            return Vector((float(value[0]), float(value[1]), float(value[2])))
        except (TypeError, ValueError):
            pass
    return Vector(fallback)


def as_rgba(value: Any, fallback: tuple[float, float, float, float] = (0.22, 0.45, 0.86, 1.0)):
    if isinstance(value, str):
        text = value.strip()
        if text.startswith("#"):
            hex_part = text[1:]
            if len(hex_part) in (6, 8):
                try:
                    pairs = [hex_part[i : i + 2] for i in range(0, len(hex_part), 2)]
                    channels = [int(pair, 16) / 255.0 for pair in pairs]
                    if len(channels) == 3:
                        channels.append(1.0)
                    return tuple(channels[:4])
                except ValueError:
                    pass
    if isinstance(value, (list, tuple)) and len(value) >= 3:
        try:
            channels = [float(v) for v in value[:4]]
            if len(channels) == 3:
                channels.append(1.0)
            if any(v > 1.0001 for v in channels[:3]):
                channels = [v / 255.0 for v in channels[:3]] + [channels[3]]
            return tuple(max(0.0, min(1.0, v)) for v in channels[:4])
        except (TypeError, ValueError):
            pass
    return fallback


def rad_triplet(value: Any, fallback: tuple[float, float, float] = (0.0, 0.0, 0.0)):
    vec = as_vec3(value, fallback)
    return (math.radians(vec.x), math.radians(vec.y), math.radians(vec.z))


def safe_set(target: Any, name: str, value: Any) -> bool:
    try:
        setattr(target, name, value)
        return True
    except (AttributeError, TypeError, ValueError):
        return False


def make_material(name: str, color_value: Any, roughness: float = 0.55):
    rgba = as_rgba(color_value)
    material = bpy.data.materials.new(name=name)
    material.diffuse_color = rgba
    material.use_nodes = True
    tree = material.node_tree
    bsdf = None
    if tree is not None:
        bsdf = tree.nodes.get("Principled BSDF")
        if bsdf is None:
            for node in tree.nodes:
                if getattr(node, "type", "") == "BSDF_PRINCIPLED":
                    bsdf = node
                    break
    if bsdf is not None:
        base = bsdf.inputs.get("Base Color") if hasattr(bsdf.inputs, "get") else None
        rough = bsdf.inputs.get("Roughness") if hasattr(bsdf.inputs, "get") else None
        if base is not None:
            safe_set(base, "default_value", rgba)
        if rough is not None:
            safe_set(rough, "default_value", max(0.0, min(1.0, roughness)))
    return material, rgba


def point_at(obj, target) -> None:
    direction = as_vec3(target) - obj.location
    if direction.length > 0.000001:
        obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_ground(scene, spec: dict[str, Any]) -> None:
    ground = spec.get("ground") if isinstance(spec.get("ground"), dict) else {}
    size = max(2.0, as_float(ground.get("size"), 20.0))
    location = as_vec3(ground.get("location"), (0.0, 0.0, 0.0))
    bpy.ops.mesh.primitive_plane_add(size=size, location=location)
    obj = bpy.context.object
    obj.name = str(ground.get("name") or "Ground")
    material, rgba = make_material(
        f"{obj.name}_Mat",
        ground.get("color", "#202632"),
        as_float(ground.get("roughness"), 0.82),
    )
    obj.data.materials.append(material)
    obj.color = rgba


def add_cubes(scene, spec: dict[str, Any], frame_start: int, frame_end: int) -> None:
    raw_cubes = spec.get("cubes")
    if not isinstance(raw_cubes, list) or not raw_cubes:
        raw_cubes = spec.get("objects")
    if not isinstance(raw_cubes, list) or not raw_cubes:
        raw_cubes = DEFAULT_CUBES

    for index, item in enumerate(raw_cubes):
        cube = item if isinstance(item, dict) else {}
        location = as_vec3(cube.get("location"), (-2.4 + index * 2.4, 0.0, 1.0))
        size = max(0.05, as_float(cube.get("size"), 2.0))
        bpy.ops.mesh.primitive_cube_add(size=size, location=location)
        obj = bpy.context.object
        obj.name = str(cube.get("name") or f"Placeholder_{index + 1:02d}")

        scale_value = cube.get("scale", [1.0, 1.0, 1.0])
        obj.scale = as_vec3(scale_value, (1.0, 1.0, 1.0))
        obj.rotation_mode = "XYZ"
        start_rotation = rad_triplet(cube.get("rotation"), (0.0, 0.0, 0.0))
        obj.rotation_euler = start_rotation

        material, rgba = make_material(
            f"{obj.name}_Mat",
            cube.get("color", DEFAULT_CUBES[index % len(DEFAULT_CUBES)]["color"]),
            as_float(cube.get("roughness"), 0.48),
        )
        obj.data.materials.append(material)
        obj.color = rgba

        spin = cube.get("spin")
        rotation_end = cube.get("rotation_end")
        if spin is not None or rotation_end is not None:
            obj.keyframe_insert(data_path="rotation_euler", frame=frame_start)
            if rotation_end is not None:
                end_rotation = rad_triplet(rotation_end, start_rotation)
            else:
                spin_vec = as_vec3(spin, (0.0, 0.0, 0.0))
                end_rotation = (
                    start_rotation[0] + math.radians(spin_vec.x),
                    start_rotation[1] + math.radians(spin_vec.y),
                    start_rotation[2] + math.radians(spin_vec.z),
                )
            obj.rotation_euler = end_rotation
            obj.keyframe_insert(data_path="rotation_euler", frame=frame_end)


def add_light(scene, name: str, light_type: str, spec: dict[str, Any], fallback: dict[str, Any]):
    data = bpy.data.lights.new(name=f"{name}_Data", type=light_type)
    data.energy = as_float(spec.get("energy"), as_float(fallback.get("energy"), 2.0))
    data.color = as_rgba(spec.get("color"), (1.0, 1.0, 1.0, 1.0))[:3]
    if light_type == "AREA":
        safe_set(data, "size", as_float(spec.get("size"), as_float(fallback.get("size"), 5.0)))
    obj = bpy.data.objects.new(name=name, object_data=data)
    scene.collection.objects.link(obj)
    fallback_location = as_vec3(fallback.get("location"), (4.0, -6.0, 8.0))
    obj.location = as_vec3(spec.get("location"), tuple(fallback_location))
    point_at(obj, spec.get("look_at", fallback.get("look_at", [0.0, 0.0, 1.0])))
    return obj


def add_camera(scene, spec: dict[str, Any], frame_start: int, frame_end: int) -> None:
    camera_spec = spec.get("camera") if isinstance(spec.get("camera"), dict) else {}
    camera_data = bpy.data.cameras.new(name="PrevisCamera")
    camera = bpy.data.objects.new(name="PrevisCamera", object_data=camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera

    camera_data.lens = max(1.0, as_float(camera_spec.get("lens"), 35.0))
    camera_data.clip_start = max(0.001, as_float(camera_spec.get("clip_start"), 0.1))
    camera_data.clip_end = max(10.0, as_float(camera_spec.get("clip_end"), 1000.0))
    safe_set(camera_data, "sensor_width", as_float(camera_spec.get("sensor_width"), 36.0))

    start_location = as_vec3(camera_spec.get("location"), (0.0, -9.0, 3.2))
    camera.location = start_location
    camera.rotation_mode = "XYZ"
    camera.rotation_euler = rad_triplet(camera_spec.get("rotation"), (0.0, 0.0, 0.0))

    look_at = camera_spec.get("look_at")
    target = None
    if look_at is not None:
        target = bpy.data.objects.new("PrevisLookAtTarget", None)
        scene.collection.objects.link(target)
        target.location = as_vec3(look_at, (0.0, 0.0, 1.0))
        target.empty_display_type = "PLAIN_AXES"
        constraint = camera.constraints.new(type="TRACK_TO")
        constraint.target = target
        safe_set(constraint, "track_axis", "TRACK_NEGATIVE_Z")
        safe_set(constraint, "up_axis", "UP_Y")
        safe_set(constraint, "influence", 1.0)
    elif "rotation" not in camera_spec:
        # No explicit rotation: aim the default camera at the staged cubes.
        point_at(camera, [0.0, 0.0, 1.0])

    end_location = camera_spec.get("end_location")
    look_at_end = camera_spec.get("look_at_end")
    if end_location is not None:
        camera.keyframe_insert(data_path="location", frame=frame_start)
        camera.location = as_vec3(end_location, tuple(start_location))
        camera.keyframe_insert(data_path="location", frame=frame_end)
    if target is not None and look_at_end is not None:
        target.keyframe_insert(data_path="location", frame=frame_start)
        target.location = as_vec3(look_at_end, tuple(target.location))
        target.keyframe_insert(data_path="location", frame=frame_end)
    if "rotation_end" in camera_spec and target is None:
        current_degrees = tuple(math.degrees(angle) for angle in camera.rotation_euler)
        camera.keyframe_insert(data_path="rotation_euler", frame=frame_start)
        camera.rotation_euler = rad_triplet(camera_spec.get("rotation_end"), current_degrees)
        camera.keyframe_insert(data_path="rotation_euler", frame=frame_end)


def add_world(scene, spec: dict[str, Any]) -> None:
    world_spec = spec.get("world") if isinstance(spec.get("world"), dict) else {}
    world = bpy.data.worlds.new("ZES_Frost_World")
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background") if world.node_tree else None
    if background is not None:
        color = background.inputs.get("Color") if hasattr(background.inputs, "get") else None
        strength = background.inputs.get("Strength") if hasattr(background.inputs, "get") else None
        if color is not None:
            safe_set(color, "default_value", as_rgba(world_spec.get("color"), (0.025, 0.035, 0.055, 1.0)))
        if strength is not None:
            safe_set(strength, "default_value", as_float(world_spec.get("strength"), 0.8))
    scene.world = world


def configure_render(scene, spec: dict[str, Any], work_dir: Path, frame_start: int, frame_end: int, fps: int):
    scene.render.resolution_x = 640
    scene.render.resolution_y = 360
    scene.render.resolution_percentage = 100
    scene.render.fps = fps
    scene.frame_start = frame_start
    scene.frame_end = frame_end
    scene.frame_step = 1
    scene.frame_set(frame_start)

    engine = str(spec.get("engine") or "CYCLES").upper()
    if engine not in {"CYCLES", "BLENDER_EEVEE_NEXT", "BLENDER_WORKBENCH"}:
        engine = "CYCLES"
    try:
        scene.render.engine = engine
    except (AttributeError, TypeError, ValueError):
        scene.render.engine = "CYCLES"
        engine = "CYCLES"

    if engine == "CYCLES":
        try:
            scene.cycles.device = "CPU"
            scene.cycles.samples = max(1, min(128, int(as_float(spec.get("samples"), 16))))
            scene.cycles.use_denoising = False
            safe_set(scene.cycles, "use_adaptive_sampling", False)
            safe_set(scene.cycles, "max_bounces", 4)
        except (AttributeError, TypeError, ValueError):
            # Older builds may not expose every Cycles property; rendering
            # still works with the engine defaults.
            pass

    safe_set(scene.render, "threads_mode", "FIXED")
    safe_set(scene.render, "threads", 2)
    safe_set(scene.render, "film_transparent", False)
    safe_set(scene.render, "use_border", False)
    safe_set(scene.render, "use_crop_to_border", False)
    safe_set(scene.render, "use_overwrite", True)
    safe_set(scene.render, "use_placeholder", False)
    safe_set(scene.render, "use_file_extension", True)

    scene.render.image_settings.file_format = "FFMPEG"
    safe_set(scene.render.image_settings, "color_mode", "RGB")
    safe_set(scene.render.image_settings, "color_depth", "8")
    safe_set(scene.render.ffmpeg, "format", "MPEG4")
    safe_set(scene.render.ffmpeg, "codec", "H264")
    safe_set(scene.render.ffmpeg, "constant_rate_factor", "MEDIUM")
    safe_set(scene.render.ffmpeg, "ffmpeg_preset", "GOOD")
    safe_set(scene.render.ffmpeg, "gopsize", max(1, fps * 2))
    safe_set(scene.render.ffmpeg, "video_bitrate", 1800)
    safe_set(scene.render.ffmpeg, "audio_codec", "NONE")

    # Absolute base path; Blender appends the frame range and .mp4 itself.
    # We move the finished file to the requested absolute output path below.
    scene.render.filepath = str((work_dir / "shot").resolve())
    try:
        scene.view_settings.view_transform = "Standard"
    except (AttributeError, TypeError, ValueError):
        pass


def on_render_post(scene, depsgraph=None) -> None:
    global RENDERED_FRAMES
    RENDERED_FRAMES += 1
    ratio = min(1.0, RENDERED_FRAMES / max(1, FRAME_TOTAL))
    progress(8 + int(ratio * 86))


def parse_cli(argv: list[str]) -> tuple[dict[str, Any], Path]:
    spec_arg = None
    out_arg = None
    positional: list[str] = []
    index = 0
    while index < len(argv):
        token = argv[index]
        if token == "--out" and index + 1 < len(argv):
            out_arg = argv[index + 1]
            index += 2
            continue
        if token == "--spec" and index + 1 < len(argv):
            spec_arg = argv[index + 1]
            index += 2
            continue
        positional.append(token)
        index += 1

    if spec_arg is None and positional:
        spec_arg = positional.pop(0)
    if out_arg is None and positional:
        out_arg = positional.pop(0)

    if not spec_arg:
        fail("missing shot-spec JSON path after --")

    text = spec_arg.strip()
    if text.startswith("{"):
        try:
            spec = json.loads(text)
        except json.JSONDecodeError as exc:
            fail(f"inline shot_spec is not valid JSON: {exc}")
    else:
        spec_path = Path(spec_arg).expanduser()
        if not spec_path.is_absolute():
            spec_path = (ROOT / spec_path).resolve()
        else:
            spec_path = spec_path.resolve()
        if not spec_path.is_file():
            fail(f"shot-spec JSON not found: {spec_path}")
        try:
            spec = json.loads(spec_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            fail(f"shot-spec JSON is invalid ({spec_path.name}): {exc}")
        except OSError as exc:
            fail(f"cannot read shot-spec JSON: {exc}")

    if not isinstance(spec, dict):
        fail("shot_spec must be a JSON object")

    if out_arg:
        out_path = Path(out_arg).expanduser()
        if not out_path.is_absolute():
            out_path = (ROOT / out_path).resolve()
        else:
            out_path = out_path.resolve()
    else:
        stamp = f"{time.strftime('%Y%m%d_%H%M%S')}_{int(time.time() * 1000) % 1000:03d}"
        out_path = (ROOT / "renders" / f"previs_{stamp}.mp4").resolve()

    return spec, out_path


def run(argv: list[str]) -> int:
    # Required by BUILD-PROMPT.md: always begin with a clean empty scene.
    bpy.ops.wm.read_factory_settings(use_empty=True)

    global FRAME_TOTAL, RENDERED_FRAMES, LAST_PROGRESS
    LAST_PROGRESS = 0
    RENDERED_FRAMES = 0

    spec, out_path = parse_cli(argv)
    emit(f"Previs: {spec.get('name') or spec.get('shot') or 'untitled shot'}")
    progress(3)

    scene = bpy.context.scene
    frame_start = max(1, int(as_float(spec.get("frame_start"), 1)))
    frame_end = max(frame_start, int(as_float(spec.get("frame_end", spec.get("frames")), 48)))
    fps = max(1, min(60, int(as_float(spec.get("fps"), 24))))
    FRAME_TOTAL = frame_end - frame_start + 1

    out_path.parent.mkdir(parents=True, exist_ok=True)
    work_dir = Path(tempfile.mkdtemp(prefix=".previs_work_", dir=str(out_path.parent)))

    add_world(scene, spec)
    add_ground(scene, spec)
    add_cubes(scene, spec, frame_start, frame_end)
    add_camera(scene, spec, frame_start, frame_end)

    lights = spec.get("lights") if isinstance(spec.get("lights"), dict) else {}
    sun_spec = spec.get("sun") if isinstance(spec.get("sun"), dict) else (lights.get("sun") if isinstance(lights.get("sun"), dict) else {})
    fill_spec = spec.get("fill") if isinstance(spec.get("fill"), dict) else (lights.get("fill") if isinstance(lights.get("fill"), dict) else {})
    add_light(scene, "ZES_Sun", "SUN", sun_spec, {
        "energy": 2.4,
        "location": [4.0, -6.0, 9.0],
        "look_at": [0.0, 0.0, 1.0],
        "color": "#fff3d6",
    })
    add_light(scene, "ZES_Fill", "AREA", fill_spec, {
        "energy": 700.0,
        "size": 6.0,
        "location": [-5.0, -2.0, 5.0],
        "look_at": [0.0, 0.0, 1.0],
        "color": "#6ee7ff",
    })

    configure_render(scene, spec, work_dir, frame_start, frame_end, fps)
    progress(6)

    handler = on_render_post
    bpy.app.handlers.render_post.append(handler)
    try:
        emit(f"Rendering {FRAME_TOTAL} frames at 640x360 / {fps} fps ({scene.render.engine})")
        progress(8)
        bpy.ops.render.render(animation=True)

        candidates = sorted(
            list(work_dir.glob("shot*.mp4")) + list(work_dir.glob("*.mp4")),
            key=lambda p: (p.stat().st_size if p.exists() else 0, p.stat().st_mtime if p.exists() else 0),
            reverse=True,
        )
        candidates = [p for p in dict.fromkeys(candidates) if p.is_file() and p.stat().st_size > 1024]
        if not candidates:
            existing = ", ".join(p.name for p in work_dir.iterdir()) or "(none)"
            fail(f"Blender finished but produced no MP4 in {work_dir.name}; files: {existing}")

        if out_path.exists():
            out_path.unlink()
        os.replace(candidates[0], out_path)
        if not out_path.is_file() or out_path.stat().st_size <= 1024:
            fail("final MP4 is empty or missing after move")

        emit(f"OUTPUT {out_path}")
        emit(f"Saved {out_path.stat().st_size} bytes to {out_path.name}")
        progress(100)
        return 0
    finally:
        try:
            bpy.app.handlers.render_post.remove(handler)
        except (ValueError, AttributeError):
            pass
        shutil.rmtree(work_dir, ignore_errors=True)


def main(argv: list[str] | None = None) -> int:
    if argv is None:
        argv = sys.argv[1:]
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    try:
        return run(argv)
    except KeyboardInterrupt:
        print("ERROR: interrupted by user", file=sys.stderr, flush=True)
        return 130
    except Exception as exc:
        detail = str(exc).strip() or exc.__class__.__name__
        print(f"ERROR: {detail}", file=sys.stderr, flush=True)
        if os.environ.get("ZES_DEBUG", "").strip().lower() in {"1", "true", "yes", "on"}:
            traceback.print_exc(file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
