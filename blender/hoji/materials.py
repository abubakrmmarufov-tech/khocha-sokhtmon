"""Materials of the model. The GLB carries only plain base values; the web viewer (src/materials.js)
looks every material up by name and gives it its textures, so the names must stay as they are."""
import bpy

# name: (base colour, roughness, metalness, extras)  extras: alpha, emission (colour, strength)
SPECS = {
    # the house (renders 1-8): white render and stone, rusticated pilasters, lattice panels
    'Facade white': ('#f2f0eb', 0.7, 0.0, {}),
    'Stone white': ('#efece5', 0.6, 0.0, {}),
    'Rustic white': ('#ebe8e1', 0.7, 0.0, {}),
    'Groove': ('#c4c1ba', 0.9, 0.0, {}),
    'Panel white': ('#f4f2ee', 0.6, 0.0, {}),
    'Panel grey': ('#c9ccce', 0.6, 0.0, {}),
    'Lattice white': ('#ecebe6', 0.7, 0.0, {}),
    'Lattice dark': ('#2e3134', 0.5, 0.4, {'alpha': 0.9}),
    'Lattice light': ('#d6d8d9', 0.55, 0.2, {'alpha': 0.9}),
    'Lattice grey': ('#8f9396', 0.5, 0.3, {'alpha': 0.9}),
    'Strip back': ('#1b1d20', 0.6, 0.0, {}),
    'Window glass': ('#22323c', 0.05, 0.0, {}),
    'Frame black': ('#1e2124', 0.4, 0.4, {}),
    'Sill white': ('#f3f1ec', 0.5, 0.0, {}),
    # podium: marble cladding, shop fronts
    'Marble': ('#a4865f', 0.35, 0.0, {}),
    'Marble dark': ('#6e563c', 0.35, 0.0, {}),
    'Marble shade': ('#5f4c35', 0.35, 0.0, {}),
    'Shop glass': ('#2a3a42', 0.04, 0.0, {}),
    'Basement glass': ('#1a2228', 0.05, 0.2, {}),
    'Shop frame': ('#202326', 0.38, 0.6, {}),
    'Shop floor': ('#d9d3c8', 0.4, 0.0, {}),
    'Shop ceiling': ('#f6efe4', 0.8, 0.0, {'emission': ('#ffd9a0', 1.4)}),
    'Shop wall': ('#d9c8ae', 0.8, 0.0, {'emission': ('#ffdcaa', 0.25)}),
    'Shop light': ('#ffffff', 0.5, 0.0, {'emission': ('#fff4e0', 5.0)}),
    'Shelf': ('#e9e4da', 0.6, 0.0, {}),
    'Counter': ('#7a5a42', 0.5, 0.0, {}),
    'Goods red': ('#c0392b', 0.6, 0.0, {}),
    'Goods blue': ('#2e5c9e', 0.6, 0.0, {}),
    'Goods yellow': ('#e3b23c', 0.6, 0.0, {}),
    'Goods white': ('#f1efe9', 0.6, 0.0, {}),
    'Goods green': ('#3f8a4f', 0.6, 0.0, {}),
    'Grille dark': ('#2a2c2e', 0.6, 0.3, {}),
    'Door wood': ('#6b4a32', 0.6, 0.0, {}),
    'Door metal': ('#3a3d40', 0.45, 0.5, {}),
    'Railing metal': ('#1f2225', 0.4, 0.6, {}),
    'Railing white': ('#eceeee', 0.35, 0.3, {}),
    'Railing steel': ('#c9cdd1', 0.3, 0.8, {}),
    'Railing glass': ('#c8d8dc', 0.04, 0.0, {'alpha': 0.25}),
    'Step stone': ('#e7e3dc', 0.6, 0.0, {}),
    # roof
    'Roof deck': ('#b38b5d', 0.85, 0.0, {}),
    'Roof': ('#9e9c97', 0.95, 0.0, {}),
    'Pergola wood': ('#9c6b3f', 0.7, 0.0, {}),
    'Planter': ('#d9d4ca', 0.8, 0.0, {}),
    'Shrub': ('#3c5a26', 0.95, 0.0, {}),
    'Leaves light': ('#557a2a', 0.95, 0.0, {}),
    # site
    'Asphalt': ('#55575a', 0.95, 0.0, {}),
    'Road line': ('#e4e2db', 0.7, 0.0, {}),
    'Kerb': ('#cfcac1', 0.9, 0.0, {}),
    'Paving': ('#d8b7a8', 0.9, 0.0, {}),
    'Paving grey': ('#c9c5bd', 0.9, 0.0, {}),
    'Lawn': ('#6f9a45', 1.0, 0.0, {}),
    'Ground': ('#86955c', 1.0, 0.0, {}),
    'Hedge': ('#355a22', 0.95, 0.0, {}),
    'Flowers red': ('#c42f45', 0.8, 0.0, {}),
    'Flowers yellow': ('#e6c03a', 0.8, 0.0, {}),
    'Flowers violet': ('#8d52b3', 0.8, 0.0, {}),
    'Flowers white': ('#f3f1ea', 0.8, 0.0, {}),
    'Flowers pink': ('#e27ba0', 0.8, 0.0, {}),
    'Mulch': ('#4a3426', 1.0, 0.0, {}),
    'Fountain stone': ('#e9e5de', 0.6, 0.0, {}),
    'Pool water': ('#2c8fa6', 0.03, 0.0, {}),
    'Jet water': ('#e8f4f8', 0.1, 0.0, {'alpha': 0.55}),
    'Pergola white': ('#f2f1ec', 0.6, 0.0, {}),
    'Bench wood': ('#8a5a36', 0.7, 0.0, {}),
    'Bench metal': ('#2b2e31', 0.45, 0.6, {}),
    'Lamp pole': ('#5d6266', 0.4, 0.7, {}),
    'Lamp white': ('#ffffff', 0.4, 0.0, {'emission': ('#fff3dc', 1.0)}),
    'Palm trunk': ('#6f5a44', 0.95, 0.0, {}),
    'Palm frond': ('#4e7a2c', 0.85, 0.0, {}),
    'Trunk': ('#4a3a2e', 0.95, 0.0, {}),
    'Neighbour': ('#d9cfc0', 0.9, 0.0, {}),
    'Interior dark': ('#3a3b3d', 0.9, 0.0, {}),
    'Ramp': ('#8d8b86', 0.9, 0.0, {}),
    'Retaining wall': ('#bdb8ae', 0.9, 0.0, {}),
    'Garage door': ('#3c3f43', 0.5, 0.4, {}),
    'Pick': ('#ffffff', 1.0, 0.0, {'alpha': 0.0}),
}


def _rgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


def make(name, spec):
    col, rough, metal, ex = spec
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is None:
        bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    r, g, b = _rgb(col)
    bsdf.inputs['Base Color'].default_value = (r, g, b, 1.0)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if 'alpha' in ex:
        bsdf.inputs['Alpha'].default_value = ex['alpha']
        try:
            m.surface_render_method = 'BLENDED'
        except Exception:
            pass
    if 'emission' in ex:
        ec, es = ex['emission']
        er, eg, eb = _rgb(ec)
        key = 'Emission Color' if 'Emission Color' in bsdf.inputs else 'Emission'
        bsdf.inputs[key].default_value = (er, eg, eb, 1.0)
        bsdf.inputs['Emission Strength'].default_value = es
    m.diffuse_color = (r, g, b, 1.0)
    return m


def build_materials():
    return {k: make(k, v) for k, v in SPECS.items()}
