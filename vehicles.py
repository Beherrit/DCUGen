import os
import random
import json
import tkinter as tk
from tkinter import messagebox, filedialog, ttk, simpledialog

def load_vehicles():
    with open('./json/vehicles.json', 'r', encoding='utf-8') as json_file:
        return json.load(json_file)

def calculate_vehicle_points(character):
    vehicle_advantage = next((adv for adv in character['advantages'] if adv['name'] == 'Vehicle'), None)
    if vehicle_advantage:
        rank = vehicle_advantage['rank']
        vehicle_points = rank * 5  # Each rank of Vehicle provides 5 vehicle points
        return vehicle_points
    return 0

def get_random_feature(features, points, selected_features):
    eligible = [f for f in features if f['cost'] <= points and f['name'] not in selected_features]
    if not eligible:
        return None
    feature = random.choice(eligible)
    return feature


def create_vehicle(points):
    data = load_vehicles()
    vehicle = {}
    remaining_points = points
    selected_features = set()

    # Assign a size
    size = get_random_feature(data['Sizes'], remaining_points, selected_features)
    if size:
        vehicle['Size'] = size['name']
        vehicle['Attributes'] = size['attributes']
        remaining_points -= size['cost']
        selected_features.add(size['name'])
        vehicle['SizeCost'] = size['cost']

    # Assign features while points allow
    vehicle['Features'] = []
    while (feature := get_random_feature(data['Features'], remaining_points, selected_features)) is not None:
        vehicle['Features'].append(feature)
        remaining_points -= feature['cost']
        selected_features.add(feature['name'])

    # Assign powers similarly
    vehicle['Powers'] = []
    while (power := get_random_feature(data['Powers'], remaining_points, selected_features)) is not None:
        vehicle['Powers'].append(power)
        remaining_points -= power['cost']
        selected_features.add(power['name'])

    return vehicle

def display_vehicle(vehicle, points, text_widget):
    text_widget.delete("1.0", tk.END)
    text_widget.insert(tk.END, f"Size: {vehicle['Size']}\n")
    text_widget.insert(tk.END, f"Strength: {vehicle['Attributes'].get('Strength', 'N/A')}, "
                               f"Toughness: {vehicle['Attributes'].get('Toughness', 'N/A')}, "
                               f"Defense: {vehicle['Attributes'].get('Defense', 'N/A')}\n\n")

    text_widget.insert(tk.END, "Features:\n")
    for feature in vehicle['Features']:
        text_widget.insert(tk.END, f"- {feature['name']}: {feature['description']} (Cost: {feature['cost']})\n")

    text_widget.insert(tk.END, "\nPowers:\n")
    for power in vehicle['Powers']:
        text_widget.insert(tk.END, f"- {power['name']}: {power['description']} (Cost: {power['cost']})\n")

    total_spent = sum(item['cost'] for item in vehicle['Features']) + sum(item['cost'] for item in vehicle['Powers']) + vehicle.get('SizeCost', 0)
    text_widget.insert(tk.END, f"\nTotal points spent: {total_spent} of {points}\n")

class VehicleBuilderGUI:
    def __init__(self, master, main_notebook, main_text_widgets):
        self.master = master
        self.main_notebook = main_notebook
        self.main_text_widgets = main_text_widgets
        self.vehicle_data = load_vehicles()
        self.selected_features = set()
        self.vehicle = {'Size': None, 'Features': [], 'Powers': []}
        self.points = 20  # Default value
        self.remaining_points = self.points

        self.master.title("Vehicle Builder")
        self.create_widgets()

    def create_widgets(self):
        # Points input frame
        points_frame = ttk.Frame(self.master)
        points_frame.pack(fill='x', padx=10, pady=5)

        ttk.Label(points_frame, text="Vehicle Points:").pack(side='left')
        self.points_entry = ttk.Entry(points_frame, width=10)
        self.points_entry.pack(side='left', padx=5)
        self.points_entry.insert(0, str(self.points))

        update_button = ttk.Button(points_frame, text="Update", command=self.update_points)
        update_button.pack(side='left')

        self.points_label = ttk.Label(points_frame, text=f"Remaining Points: {self.remaining_points}")
        self.points_label.pack(side='left', padx=10)

        self.notebook = ttk.Notebook(self.master)
        self.notebook.pack(expand=True, fill='both')

        self.random_tab = ttk.Frame(self.notebook)
        self.custom_tab = ttk.Frame(self.notebook)
        self.notebook.add(self.random_tab, text="Random Vehicle")
        self.notebook.add(self.custom_tab, text="Custom Vehicle")

        self.setup_random_tab()
        self.setup_custom_tab()

    def setup_random_tab(self):
        self.random_text = tk.Text(self.random_tab, height=20, width=60)
        self.random_text.pack(expand=True, fill='both', padx=10, pady=10)

        generate_button = ttk.Button(self.random_tab, text="Generate Random Vehicle", command=self.generate_random_vehicle)
        generate_button.pack(pady=10)

    def setup_custom_tab(self):
        self.custom_frame = ttk.Frame(self.custom_tab)
        self.custom_frame.pack(expand=True, fill='both', padx=10, pady=10)

        # Size selection
        ttk.Label(self.custom_frame, text="Size:").grid(row=0, column=0, sticky='w')
        self.size_var = tk.StringVar()
        self.size_combo = ttk.Combobox(self.custom_frame, textvariable=self.size_var, state="readonly")
        self.size_combo['values'] = [size['name'] for size in self.vehicle_data['Sizes']]
        self.size_combo.grid(row=0, column=1, sticky='w')
        self.size_combo.bind("<<ComboboxSelected>>", self.on_size_selected)

        # Features and Powers
        self.feature_vars = []
        self.power_vars = []

        ttk.Label(self.custom_frame, text="Features:").grid(row=1, column=0, sticky='w')
        for i, feature in enumerate(self.vehicle_data['Features']):
            var = tk.BooleanVar()
            cb = ttk.Checkbutton(self.custom_frame, text=f"{feature['name']} (Cost: {feature['cost']})", variable=var, command=self.update_custom_points)
            cb.grid(row=i+1, column=1, sticky='w')
            self.feature_vars.append((var, feature))

        ttk.Label(self.custom_frame, text="Powers:").grid(row=len(self.vehicle_data['Features'])+2, column=0, sticky='w')
        for i, power in enumerate(self.vehicle_data['Powers']):
            var = tk.BooleanVar()
            cb = ttk.Checkbutton(self.custom_frame, text=f"{power['name']} (Cost: {power['cost']})", variable=var, command=self.update_custom_points)
            cb.grid(row=i+len(self.vehicle_data['Features'])+2, column=1, sticky='w')
            self.power_vars.append((var, power))

        # Add Generate Custom Vehicle button
        generate_custom_button = ttk.Button(self.custom_tab, text="Generate Custom Vehicle", command=self.generate_custom_vehicle)
        generate_custom_button.pack(pady=10)

    def on_size_selected(self, event):
        self.update_custom_points()

    def update_points(self):
        try:
            self.points = int(self.points_entry.get())
            self.remaining_points = self.points
            self.update_custom_points()
        except ValueError:
            pass  # Removed messagebox.showerror

    def update_custom_points(self):
        total_cost = 0
        size = next((s for s in self.vehicle_data['Sizes'] if s['name'] == self.size_var.get()), None)
        if size:
            total_cost += size['cost']

        for var, feature in self.feature_vars + self.power_vars:
            if var.get():
                total_cost += feature['cost']

        self.remaining_points = self.points - total_cost
        self.points_label.config(text=f"Remaining Points: {self.remaining_points}")

    def generate_random_vehicle(self):
        try:
            points = int(self.points_entry.get())
            vehicle = create_vehicle(points)
            self.add_to_main_gui(vehicle)
            # Removed messagebox.showinfo
        except ValueError:
            pass  # Removed messagebox.showerror

    def generate_custom_vehicle(self):
        vehicle = {'Size': None, 'Features': [], 'Powers': [], 'Attributes': {}}
        
        size = next((s for s in self.vehicle_data['Sizes'] if s['name'] == self.size_var.get()), None)
        if size:
            vehicle['Size'] = size['name']
            vehicle['Attributes'] = size['attributes']
            vehicle['SizeCost'] = size['cost']

        for var, feature in self.feature_vars:
            if var.get():
                vehicle['Features'].append(feature)
        
        for var, power in self.power_vars:
            if var.get():
                vehicle['Powers'].append(power)

        self.add_to_main_gui(vehicle)
        # Removed messagebox.showinfo

    def add_to_main_gui(self, vehicle):
        new_tab = ttk.Frame(self.main_notebook)
        tab_name = f"Vehicle {len(self.main_text_widgets) + 1}"
        self.main_notebook.add(new_tab, text=tab_name)

        text_widget = tk.Text(new_tab, height=20, width=60)
        text_widget.pack(expand=True, fill='both', padx=10, pady=10)

        display_vehicle(vehicle, self.points, text_widget)

        self.main_text_widgets[new_tab] = text_widget

def on_generate_vehicle_click(notebook, text_widgets):
    vehicle_window = tk.Toplevel()
    VehicleBuilderGUI(vehicle_window, notebook, text_widgets)

def on_save_vehicle_click(notebook, text_widgets):
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
            messagebox.showinfo("Save Vehicle", f"Vehicle saved to {filename}")

def create_vehicle_management_frame(left_frame, notebook, text_widgets):
    vehicle_frame = CollapsibleSection(left_frame, "Vehicle Management")
    vehicle_frame.pack(fill="x", pady=5)

    generate_vehicle_button = ttk.Button(vehicle_frame.body_frame, text="Generate Vehicle", command=lambda: on_generate_vehicle_click(notebook, text_widgets), style='Vehicle.TButton')
    vehicle_frame.add_widget(generate_vehicle_button)

    save_vehicle_button = ttk.Button(vehicle_frame.body_frame, text="Save Vehicle", command=lambda: on_save_vehicle_click(notebook, text_widgets), style='Vehicle.TButton')
    vehicle_frame.add_widget(save_vehicle_button)

    return vehicle_frame

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
