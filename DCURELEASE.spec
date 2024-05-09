# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['DCURELEASE.py'],
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
                ('stats.json', '.')],
                ('CharacterName.xlsx', '.'),
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='DCURELEASE',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
