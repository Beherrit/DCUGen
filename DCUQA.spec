# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

a = Analysis(['DCUQA.py'],
             pathex=[],
             binaries=[],
             datas=[
                  ('json/archetypes.json', 'json'),
                  ('json/advantages.json', 'json'),
                  ('json/CharacterName.xlsx', '.'),
                  ('json/characterOrigins.json', 'json'),
                  ('json/complications.json', 'json'),
                  ('json/conditions.json', 'json'),
                  ('json/descriptions.json', 'json'),
                  ('json/encounters.json', 'json'),
                  ('json/extras.json', 'json'),
                  ('json/female_names.json', 'json'),
                  ('json/flaws.json', 'json'),
                  ('json/gadget_data.json', 'json'),
                  ('json/headquarters.json', 'json'),
                  ('json/image_mappings.json', 'json'),
                  ('json/languages.json', 'json'),
                  ('json/male_names.json', 'json'),
                  ('json/motivations.json', 'json'),
                  ('json/PersonalityTraits.json', 'json'),
                  ('json/physical_traits.json', 'json'),
                  ('json/powers.json', 'json'),
                  ('json/skills.json', 'json'),
                  ('json/stats.json', 'json'),
                  ('json/theme.json', 'json'),
                  ('json/vehicles.json', 'json'),
                  # Add image files
                  ('images/actions/action_*', 'images/actions'),
                  ('images/combat_misc/cm_*', 'images/combat_misc'),
                  ('images/environmental/env_*', 'images/environmental'),
                  ('images/extras/ex_*', 'images/extras'),
                  ('images/flaws/flaw_*', 'images/flaws'),
                  ('images/maneuvers/man_*', 'images/maneuvers'),
                  ('images/bmt_skills/BMT_*', 'images/bmt_skills'),
                  ('images/skills/skills_*', 'images/skills'),
                  ('library/music/*', 'library/music'),  # Add this line to include music files
             ],
             hiddenimports=['pygame'],  # Add pygame to hidden imports
             hookspath=[],
             runtime_hooks=[],
             excludes=[],
             win_no_prefer_redirects=False,
             win_private_assemblies=False,
             cipher=block_cipher,
             noarchive=False)

pyz = PYZ(a.pure, a.zipped_data,
          cipher=block_cipher)

exe = EXE(pyz,
          a.scripts,
          a.binaries,
          a.zipfiles,
          a.datas,
          [],
          name='DCUQA',
          debug=False,
          bootloader_ignore_signals=False,
          strip=False,
          upx=True,
          runtime_tmpdir=None,
          console=False)  # Change to True if you want a console application

coll = COLLECT(exe,
               a.binaries,
               a.zipfiles,
               a.datas,
               strip=False,
               upx=True,
               upx_exclude=[],
               name='DCUQA')
