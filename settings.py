import tkinter as tk
from ttkbootstrap import Style, ttk

current_theme = 'darkly'

def apply_theme(theme, root):
    global current_theme
    current_theme = theme
    style = Style(theme=theme)
    style.theme_use(theme)
    for child in root.winfo_children():
        if isinstance(child, ttk.Frame):
            child.configure(style='TFrame')

def open_settings(root):
    settings_window = tk.Toplevel(root)
    settings_window.title("Settings")
    settings_window.geometry("300x400")

    theme_label = ttk.Label(settings_window, text="Select Color Theme:")
    theme_label.pack(pady=10)

    themes = [
        ('Default', 'darkly'),
        ('High Contrast', 'superhero'),
        ('Colorblind Friendly', 'solar'),
        ('Light Mode', 'flatly'),
        ('Pastel', 'minty'),
        ('United', 'united'),
        ('Journal', 'journal'),
        ('Sandstone', 'sandstone'),
        ('Lumen', 'lumen'),
        ('Litera', 'litera'),
        ('Cosmo', 'cosmo'),
        ('Cyborg', 'cyborg'),
        ('Morph', 'morph'),
        ('Pulse', 'pulse'),
        ('Simplex', 'simplex'),
        ('Vapor', 'vapor'),
        ('Yeti', 'yeti')
    ]
    theme_var = tk.StringVar(value=current_theme)

    def preview_theme():
        apply_theme(theme_var.get(), settings_window)

    theme_frame = ttk.Frame(settings_window)
    theme_frame.pack(fill='both', expand=True)

    canvas = tk.Canvas(theme_frame)
    scrollbar = ttk.Scrollbar(theme_frame, orient="vertical", command=canvas.yview)
    scrollable_frame = ttk.Frame(canvas)

    scrollable_frame.bind(
        "<Configure>",
        lambda e: canvas.configure(
            scrollregion=canvas.bbox("all")
        )
    )

    canvas.create_window((0, 0), window=scrollable_frame, anchor="nw")
    canvas.configure(yscrollcommand=scrollbar.set)

    for theme_name, theme_value in themes:
        radio_button = ttk.Radiobutton(scrollable_frame, text=theme_name, variable=theme_var, value=theme_value, command=preview_theme)
        radio_button.pack(anchor='w', padx=20, pady=5)

    canvas.pack(side="left", fill="both", expand=True)
    scrollbar.pack(side="right", fill="y")

    # Bind mousewheel and arrow keys to scroll
    def _on_mousewheel(event):
        canvas.yview_scroll(int(-1*(event.delta/120)), "units")

    def _on_up_arrow(event):
        canvas.yview_scroll(-1, "units")

    def _on_down_arrow(event):
        canvas.yview_scroll(1, "units")

    canvas.bind_all("<MouseWheel>", _on_mousewheel)
    canvas.bind_all("<Up>", _on_up_arrow)
    canvas.bind_all("<Down>", _on_down_arrow)

    def apply_changes():
        apply_theme(theme_var.get(), root)
        settings_window.destroy()

    apply_button = ttk.Button(settings_window, text="Apply", command=apply_changes)
    apply_button.pack(pady=20)

    settings_window.mainloop()

def apply_current_theme(window):
    apply_theme(current_theme, window)
