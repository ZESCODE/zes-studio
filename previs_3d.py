#!/usr/bin/env python3
"""
Blender Previs & 3D Layout Tool for ZES Studio

This script provides a Python interface to generate Blender scripts for
previsualization and 3D layout. It can:
- Write Blender Python scripts to block out scenes, camera movements,
  lighting, and object layouts.
- Interface with Blender (if installed) to execute these scripts and
  generate preview renders or .blend files.

Usage:
  python previs_3d.py --scene cube --output scene.blend
  python previs_3d.py --camera move --start 0 --end 120 --output camera.blend
  python previs_3d.py --light setup --output light.blend
  python previs_3d.py --layout "cube:0,0,0;sphere:2,0,0" --output layout.blend

Requirements:
  - Blender must be installed and accessible via command line (blender --version)
  - For script generation only, no Blender installation is required.
"""
import argparse
import os
import sys
import subprocess
import json
from pathlib import Path

# Blender Python script templates
BLENDER_SCRIPT_HEADER = """
import bpy
import math

# Clear existing scene
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

"""

BLENDER_SCRIPT_FOOTER = """
# Save the .blend file
bpy.ops.wm.save_as_mainfile(filepath=OUTPUT_FILE)

# Optional: Render preview
# bpy.context.scene.render.engine = 'BLENDER_EEVEE'
# bpy.ops.render.render(write_still=True)
"""

def create_scene_script(objects: list[dict], output_file: str) -> str:
    """Generate a Blender Python script to create a scene with specified objects."""
    script = BLENDER_SCRIPT_HEADER
    for obj in objects:
        obj_type = obj.get("type", "cube")
        location = obj.get("location", [0, 0, 0])
        rotation = obj.get("rotation", [0, 0, 0])
        scale = obj.get("scale", [1, 1, 1])
        name = obj.get("name", obj_type)
        if obj_type == "cube":
            script += f"bpy.ops.mesh.primitive_cube_add(location={location})\n"
        elif obj_type == "sphere":
            script += f"bpy.ops.mesh.primitive_uv_sphere_add(location={location})\n"
        elif obj_type == "cylinder":
            script += f"bpy.ops.mesh.primitive_cylinder_add(location={location})\n"
        elif obj_type == "plane":
            script += f"bpy.ops.mesh.primitive_plane_add(location={location})\n"
        else:
            continue
        script += f"bpy.context.object.name = '{name}'\n"
        script += f"bpy.context.object.rotation_euler = {rotation}\n"
        script += f"bpy.context.object.scale = {scale}\n\n"
    script += BLENDER_SCRIPT_FOOTER.replace("OUTPUT_FILE", repr(output_file))
    return script

def create_camera_script(camera_moves: list[dict], output_file: str) -> str:
    """Generate a Blender Python script to set up camera movement."""
    script = BLENDER_SCRIPT_HEADER
    # Create a camera
    script += "bpy.ops.object.camera_add(location=[0, -5, 0])\n"
    script += "bpy.context.scene.camera = bpy.context.object\n\n"
    for move in camera_moves:
        start_frame = move.get("start", 0)
        end_frame = move.get("end", 120)
        start_loc = move.get("start_location", [0, -5, 0])
        end_loc = move.get("end_location", [0, 5, 0])
        script += f"# Move from {start_loc} to {end_loc} over frames {start_frame}-{end_frame}\n"
        script += f"bpy.context.scene.frame_start = {start_frame}\n"
        script += f"bpy.context.scene.frame_end = {end_frame}\n"
        script += f"bpy.context.object.location = {start_loc}\n"
        script += f"bpy.context.object.keyframe_insert(data_path='location', frame={start_frame})\n"
        script += f"bpy.context.object.location = {end_loc}\n"
        script += f"bpy.context.object.keyframe_insert(data_path='location', frame={end_frame})\n\n"
    script += BLENDER_SCRIPT_FOOTER.replace("OUTPUT_FILE", repr(output_file))
    return script

def create_light_script(lights: list[dict], output_file: str) -> str:
    """Generate a Blender Python script to set up lighting."""
    script = BLENDER_SCRIPT_HEADER
    for light in lights:
        light_type = light.get("type", "point")
        location = light.get("location", [0, 0, 5])
        energy = light.get("energy", 1000)
        color = light.get("color", [1, 1, 1])
        name = light.get("name", light_type)
        if light_type == "point":
            script += f"bpy.ops.object.light_add(type='POINT', location={location})\n"
        elif light_type == "sun":
            script += f"bpy.ops.object.light_add(type='SUN', location={location})\n"
        elif light_type == "area":
            script += f"bpy.ops.object.light_add(type='AREA', location={location})\n"
        else:
            continue
        script += f"bpy.context.object.name = '{name}'\n"
        script += f"bpy.context.object.data.energy = {energy}\n"
        script += f"bpy.context.object.data.color = {color}\n\n"
    script += BLENDER_SCRIPT_FOOTER.replace("OUTPUT_FILE", repr(output_file))
    return script

def create_layout_script(layout: dict, output_file: str) -> str:
    """Generate a Blender Python script to create a full layout with objects, camera, and lights."""
    script = create_scene_script(layout.get("objects", []), output_file)
    # Add camera and lights
    camera_script = create_camera_script(layout.get("camera_moves", []), output_file)
    light_script = create_light_script(layout.get("lights", []), output_file)
    # Combine scripts (simple concatenation for now)
    script += camera_script.split(BLENDER_SCRIPT_HEADER)[1].split(BLENDER_SCRIPT_FOOTER)[0]
    script += light_script.split(BLENDER_SCRIPT_HEADER)[1].split(BLENDER_SCRIPT_FOOTER)[0]
    return script

def run_blender_script(script_content: str, script_path: str) -> bool:
    """Execute a Blender Python script using Blender's command line."""
    try:
        with open(script_path, 'w') as f:
            f.write(script_content)
        # Check if Blender is available
        check_cmd = ["blender", "--version"]
        try:
            subprocess.run(check_cmd, capture_output=True, text=True, timeout=10)
        except FileNotFoundError:
            print("Blender not found. Please install Blender or add it to PATH.", file=sys.stderr)
            return False
        except subprocess.TimeoutExpired:
            print("Blender version check timed out.", file=sys.stderr)
            return False
        cmd = ["blender", "--background", "--python", script_path]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode == 0:
            print("Blender script executed successfully.")
            return True
        else:
            print(f"Blender error: {result.stderr}", file=sys.stderr)
            return False
    except FileNotFoundError:
        print("Blender not found. Please install Blender or add it to PATH.", file=sys.stderr)
        return False
    except subprocess.TimeoutExpired:
        print("Blender execution timed out.", file=sys.stderr)
        return False

def main():
    parser = argparse.ArgumentParser(description="Blender Previs & 3D Layout Tool for ZES Studio")
    parser.add_argument("--scene", choices=["cube", "sphere", "cylinder", "plane"], help="Create a simple scene with the specified object")
    parser.add_argument("--camera", choices=["move"], help="Set up camera movement")
    parser.add_argument("--light", choices=["setup"], help="Set up lighting")
    parser.add_argument("--layout", help="Create a full layout from JSON string: '{\"objects\": [...], \"camera_moves\": [...], \"lights\": [...]}'")
    parser.add_argument("--start", type=int, default=0, help="Start frame for camera movement")
    parser.add_argument("--end", type=int, default=120, help="End frame for camera movement")
    parser.add_argument("--output", default="previs.blend", help="Output .blend file path")
    parser.add_argument("--execute", action="store_true", help="Execute the Blender script (requires Blender installed)")
    args = parser.parse_args()

    script_content = ""
    script_path = os.path.join(os.path.expanduser("~"), "previs_script.py")

    if args.scene:
        objects = [{"type": args.scene, "location": [0, 0, 0]}]
        script_content = create_scene_script(objects, args.output)
    elif args.camera:
        camera_moves = [{"start": args.start, "end": args.end, "start_location": [0, -5, 0], "end_location": [0, 5, 0]}]
        script_content = create_camera_script(camera_moves, args.output)
    elif args.light:
        lights = [{"type": "point", "location": [0, 0, 5], "energy": 1000}]
        script_content = create_light_script(lights, args.output)
    elif args.layout:
        layout = json.loads(args.layout)
        script_content = create_layout_script(layout, args.output)
    else:
        parser.print_help()
        return

    if args.execute:
        success = run_blender_script(script_content, script_path)
        if not success:
            sys.exit(1)
    else:
        with open(script_path, 'w') as f:
            f.write(script_content)
        print(f"Blender script written to {script_path}")
        print(f"To execute: blender --background --python {script_path}")

if __name__ == "__main__":
    main()