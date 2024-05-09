# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

a = Analysis(['DCUQA.py'],
             pathex=[],
             binaries=[],
             datas=[
                ('advantages.json', '.'),
                ('complications.json', '.'),
                ('extras.json', '.'),
                ('female_names.json', '.'),
                ('flaws.json', '.'),
                ('gadget_data.json', '.'),
                ('languages.json', '.'),
                ('male_names.json', '.'),
                ('motivations.json', '.'),
                ('physical_traits.json', '.'),
                ('powers.json', '.'),
                ('power_preset.json', '.'),
                ('skills.json', '.'),
                ('stats.json', '.'),
                ('characterOrigins.json', '.'),
                ('archetypes.json', '.'),
                ('CharacterName.xlsx', '.'),  # Add the path to 'CharacterName.xlsx' if it's in a different folder
                ('PersonalityTraits.json', '.'),
                ('theme.json', '.')

             ],
             hiddenimports=[],
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
