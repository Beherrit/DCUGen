import tkinter as tk
from tkinter import ttk

def apply_theme(theme, root):
    style = ttk.Style()
    if theme == 'dark':
        style.theme_use('clam')
        root.configure(bg='#2e2e2e')
        style.configure('.', background='#2e2e2e', foreground='white', font=('Helvetica', 10))
        style.configure('TButton', background='#4d4d4d', foreground='white')
        style.map('TButton', background=[('active', '#666666')])
    elif theme == 'light':
        style.theme_use('clam')
        root.configure(bg='#f0f0f0')
        style.configure('.', background='#f0f0f0', foreground='black', font=('Helvetica', 10))
        style.configure('TButton', background='#ffffff', foreground='black')
        style.map('TButton', background=[('active', '#e0e0e0')])
    elif theme == 'blue':
        style.theme_use('clam')
        root.configure(bg='#003366')
        style.configure('.', background='#003366', foreground='white', font=('Helvetica', 10))
        style.configure('TButton', background='#004080', foreground='white')
        style.map('TButton', background=[('active', '#0059b3')])
    elif theme == 'green':
        style.theme_use('clam')
        root.configure(bg='#336633')
        style.configure('.', background='#336633', foreground='white', font=('Helvetica', 10))
        style.configure('TButton', background='#408040', foreground='white')
        style.map('TButton', background=[('active', '#66b266')])
    elif theme == 'red':
        style.theme_use('clam')
        root.configure(bg='#660000')
        style.configure('.', background='#660000', foreground='white', font=('Helvetica', 10))
        style.configure('TButton', background='#800000', foreground='white')
        style.map('TButton', background=[('active', '#b30000')])
    elif theme == 'system':
        style.theme_use('default')
        root.configure(bg=root.cget('bg'))  # Use the system default background
        style.configure('.', background=root.cget('bg'), foreground='black', font=('Helvetica', 10))
        style.configure('TButton', background=root.cget('bg'), foreground='black')
        style.map('TButton', background=[('active', '#e0e0e0')])
    elif theme == 'default':
        style.theme_use('clam')
        root.configure(bg='#f0f0f0')
        style.configure('.', background='#f0f0f0', foreground='black', font=('Helvetica', 8))
        style.configure('TButton', padding=2, font=("Helvetica", 8))
        style.configure('Character.TButton', background='#aed6f1', foreground='black')
        style.map('Character.TButton', background=[('active', '#aed6f1')])
        style.configure('Equipment.TButton', background='#a2d9ce', foreground='black')
        style.map('Equipment.TButton', background=[('active', '#a2d9ce')])
        style.configure('Hideout.TButton', background='#f9e79f', foreground='black')
        style.map('Hideout.TButton', background=[('active', '#f9e79f')])
        style.configure('Encounter.TButton', background='#f5b7b1', foreground='black')
        style.map('Encounter.TButton', background=[('active', '#f5b7b1')])
        style.configure('Initiative.TButton', background='#d7bde2', foreground='black')
        style.map('Initiative.TButton', background=[('active', '#d7bde2')])

def open_settings(root):
    settings_window = tk.Toplevel(root)
    settings_window.title("Settings")
    settings_window.geometry("300x250")

    theme_label = ttk.Label(settings_window, text="Select Color Theme:")
    theme_label.pack(pady=10)

    themes = ['default', 'dark', 'light', 'blue', 'green', 'red', 'system']
    theme_var = tk.StringVar(value='default')

    for theme in themes:
        radio_button = ttk.Radiobutton(settings_window, text=theme.capitalize(), variable=theme_var, value=theme)
        radio_button.pack(anchor='w', padx=20)

    def apply_changes():
        apply_theme(theme_var.get(), root)

    apply_button = ttk.Button(settings_window, text="Apply", command=apply_changes)
    apply_button.pack(pady=20)

    settings_window.mainloop()
