import os
import random
import json
import tkinter as tk
from tkinter import messagebox, filedialog, ttk, simpledialog

def load_hideouts():
    with open('./json/headquarters.json', 'r', encoding='utf-8') as json_file:
        return json.load(json_file)['headquarters']

class HideoutBuilderGUI:
    def __init__(self, master, main_notebook, main_text_widgets):
        self.master = master
        self.main_notebook = main_notebook
        self.main_text_widgets = main_text_widgets
        self.hideout_data = load_hideouts()
        self.selected_traits = set()
        self.hideout = {'Size': None, 'Toughness': None, 'Traits': []}

        self.master.title("Hideout Builder")
        self.create_widgets()

    def create_widgets(self):
        self.notebook = ttk.Notebook(self.master)
        self.notebook.pack(expand=True, fill='both')

        self.random_tab = ttk.Frame(self.notebook)
        self.custom_tab = ttk.Frame(self.notebook)
        self.notebook.add(self.random_tab, text="Random Hideout")
        self.notebook.add(self.custom_tab, text="Custom Hideout")

        self.setup_random_tab()
        self.setup_custom_tab()

    def setup_random_tab(self):
        generate_button = ttk.Button(self.random_tab, text="Generate Random Hideout", command=self.generate_random_hideout)
        generate_button.pack(pady=10)

    def setup_custom_tab(self):
        self.custom_frame = ttk.Frame(self.custom_tab)
        self.custom_frame.pack(expand=True, fill='both', padx=10, pady=10)

        # Size selection
        ttk.Label(self.custom_frame, text="Size:").grid(row=0, column=0, sticky='w')
        self.size_var = tk.StringVar()
        self.size_combo = ttk.Combobox(self.custom_frame, textvariable=self.size_var, state="readonly")
        self.size_combo['values'] = self.hideout_data['sizes']
        self.size_combo.grid(row=0, column=1, sticky='w')

        # Toughness selection
        ttk.Label(self.custom_frame, text="Toughness:").grid(row=1, column=0, sticky='w')
        self.toughness_var = tk.StringVar()
        self.toughness_combo = ttk.Combobox(self.custom_frame, textvariable=self.toughness_var, state="readonly")
        self.toughness_combo['values'] = self.hideout_data['toughness']
        self.toughness_combo.grid(row=1, column=1, sticky='w')

        # Traits selection
        ttk.Label(self.custom_frame, text="Traits:").grid(row=2, column=0, sticky='w')
        self.traits_frame = ttk.Frame(self.custom_frame)
        self.traits_frame.grid(row=2, column=1, sticky='w')
        self.trait_vars = []

        for i, trait in enumerate(self.hideout_data['traits']):
            var = tk.BooleanVar()
            cb = ttk.Checkbutton(self.traits_frame, text=trait['name'], variable=var)
            cb.grid(row=i // 3, column=i % 3, sticky='w')
            self.trait_vars.append((var, trait))

        generate_button = ttk.Button(self.custom_frame, text="Generate Custom Hideout", command=self.generate_custom_hideout)
        generate_button.grid(row=3, column=0, columnspan=2, pady=10)

    def generate_random_hideout(self):
        hideout = {
            'Size': random.choice(self.hideout_data['sizes']),
            'Toughness': random.choice(self.hideout_data['toughness']),
            'Traits': random.sample(self.hideout_data['traits'], random.randint(5, 10))
        }
        self.add_to_main_gui(hideout)

    def generate_custom_hideout(self):
        hideout = {
            'Size': self.size_var.get(),
            'Toughness': self.toughness_var.get(),
            'Traits': [trait for var, trait in self.trait_vars if var.get()]
        }
        self.add_to_main_gui(hideout)

    def add_to_main_gui(self, hideout):
        new_tab = ttk.Frame(self.main_notebook)
        tab_name = f"Hideout {len(self.main_text_widgets) + 1}"
        self.main_notebook.add(new_tab, text=tab_name)

        text_widget = tk.Text(new_tab, height=20, width=60)
        text_widget.pack(expand=True, fill='both', padx=10, pady=10)

        self.display_hideout(hideout, text_widget)

        self.main_text_widgets[new_tab] = text_widget
        self.main_notebook.select(new_tab)

        messagebox.showinfo("Hideout Generated", "Hideout has been added to the main program.")

    def display_hideout(self, hideout, text_widget):
        text_widget.delete("1.0", tk.END)
        text_widget.insert(tk.END, f"Size: {hideout['Size']}\n")
        text_widget.insert(tk.END, f"Toughness: {hideout['Toughness']}\n\n")
        text_widget.insert(tk.END, "Traits:\n")
        for trait in hideout['Traits']:
            text_widget.insert(tk.END, f"- {trait['name']}: {trait['description']}\n\n")

def on_generate_hideout_click(notebook, text_widgets):
    hideout_window = tk.Toplevel()
    HideoutBuilderGUI(hideout_window, notebook, text_widgets)

def on_save_hideout_click(notebook, text_widgets):
    selected_tab = notebook.nametowidget(notebook.select())
    text_widget = text_widgets.get(selected_tab)

    if text_widget:
        content = text_widget.get("1.0", tk.END)
        filename = filedialog.asksaveasfilename(
            defaultextension=".txt",
            filetypes=[("Text files", "*.txt")],
            initialdir=os.path.expanduser("~/Desktop")
        )
        if filename:
            with open(filename, 'w') as file:
                file.write(content)
            messagebox.showinfo("Save Hideout", f"Hideout saved to {filename}")

def create_hideout_management_frame(left_frame, notebook, text_widgets):
    hideout_frame = CollapsibleSection(left_frame, "Hideout Management")
    hideout_frame.pack(fill="x", pady=5)

    generate_hideout_button = ttk.Button(hideout_frame.body_frame, text="Generate Hideout", command=lambda: on_generate_hideout_click(notebook, text_widgets), style='Hideout.TButton')
    hideout_frame.add_widget(generate_hideout_button)

    save_hideout_button = ttk.Button(hideout_frame.body_frame, text="Save Hideout", command=lambda: on_save_hideout_click(notebook, text_widgets), style='Hideout.TButton')
    hideout_frame.add_widget(save_hideout_button)

    return hideout_frame

class CollapsibleSection(ttk.Frame):
    def __init__(self, parent, title="", *args, **options):
        ttk.Frame.__init__(self, parent, *args, **options)
        self.title_frame = ttk.Frame(self)
        self.title_frame.pack(fill="x", expand=1)
        
        self.body_frame = ttk.Frame(self)
        
        self.toggle_button = ttk.Checkbutton(self.title_frame, text=title, command=self.toggle, style="Toolbutton")
        self.toggle_button.pack(side="left", fill="x", expand=1)
        
        self.add_widgets()

    def toggle(self):
        if self.body_frame.winfo_ismapped():
            self.body_frame.pack_forget()
        else:
            self.body_frame.pack(fill="x", expand=1)

    def add_widgets(self):
        pass

    def add_widget(self, widget):
        widget.pack(fill="x", padx=5, pady=2)
