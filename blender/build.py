"""Build the house and its grounds in Blender and export them for the web viewer.

    blender/export.sh                        # -> public/models/house.glb, src/model/complex.json
    blender -b -P blender/build.py -- --out build/house [--render build/house.png --view front]
"""
import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from hoji.geom import get_collection  # noqa: E402

VIEWS = {
    # roughly the client's renders
    'front': dict(location=(-14.0, -95.0, 8.0), target=(0.0, 0.0, 18.0), lens=30.0),     # render 5 / 8
    'aerial': dict(location=(75.0, -110.0, 75.0), target=(0.0, 0.0, 15.0), lens=35.0),   # render 1
    'back': dict(location=(-60.0, 95.0, 60.0), target=(0.0, 0.0, 14.0), lens=35.0),      # render 3
}


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--out', default='build/house')
    p.add_argument('--render')
    p.add_argument('--view', default='front')
    p.add_argument('--res', default='1600x1000')
    p.add_argument('--no-site', action='store_true')
    p.add_argument('--no-glb', action='store_true')
    return p.parse_args(argv)


def add_view(scene, name, location, target, lens):
    cd = bpy.data.cameras.new(name)
    cd.lens = lens
    cd.clip_start = 0.5
    cd.clip_end = 5000.0
    ob = bpy.data.objects.new(name, cd)
    scene.collection.objects.link(ob)
    ob.location = location
    ob.rotation_euler = (Vector(target) - Vector(location)).to_track_quat('-Z', 'Y').to_euler()
    return ob


def setup_light(scene):
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
    sun.data.energy = 3.5
    scene.collection.objects.link(sun)
    az, el = math.radians(200), math.radians(45)
    d = Vector((-math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), -math.sin(el)))
    sun.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    world = bpy.data.worlds.new('Sky')
    scene.world = world
    try:
        world.use_nodes = True
    except Exception:
        pass
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.7, 0.95, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.8


def main():
    args = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    from hoji.materials import build_materials
    from hoji.building import build_house, house_extent
    from hoji.site import Site
    mats = build_materials()
    house_col = get_collection('House')
    tower = build_house(mats, house_col)
    info = dict(site_centre=[0.0, 0.0], towers=[tower], people=[], trees_placed=[], tree_protos=[], trees=[], cars=[],
                palms=[], benches=[], labels=[])
    if not args.no_site:
        site = Site(house_extent())
        site.build(mats, get_collection('Site'))
        info.update(people=site.people, trees_placed=site.trees, cars=site.cars, palms=site.palms, lamps=site.lamps)
    from hoji.building import terrace_plants
    info['terrace_plants'] = terrace_plants()
    out = os.path.abspath(args.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out + '.json', 'w') as f:
        json.dump(info, f, ensure_ascii=False)
    views = {n: add_view(scene, n, **v) for n, v in VIEWS.items()}
    setup_light(scene)
    bpy.ops.wm.save_as_mainfile(filepath=out + '.blend', compress=True)
    if not args.no_glb:
        bpy.ops.export_scene.gltf(filepath=out + '.glb', export_format='GLB', export_apply=True,
                                  export_cameras=False, export_lights=False, export_extras=True)
    if args.render:
        scene.camera = views[args.view]
        w, h = map(int, args.res.split('x'))
        scene.render.resolution_x, scene.render.resolution_y = w, h
        scene.render.engine = 'BLENDER_EEVEE'
        scene.render.filepath = os.path.abspath(args.render)
        bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    main()
