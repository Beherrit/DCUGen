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
    text_widget.insert(tk.END, f"Strength: {vehicle['Attributes']['Strength']}, Toughness: {vehicle['Attributes']['Toughness']}, Defense: {vehicle['Attributes']['Defense']}\n\n")

    text_widget.insert(tk.END, "Features:\n")
    for feature in vehicle['Features']:
        text_widget.insert(tk.END, f"- {feature['name']}: {feature['description']} (Cost: {feature['cost']})\n")

    text_widget.insert(tk.END, "\nPowers:\n")
    for power in vehicle['Powers']:
        text_widget.insert(tk.END, f"- {power['name']}: {power['description']} (Cost: {power['cost']})\n")

    total_spent = sum(item['cost'] for item in vehicle['Features']) + sum(item['cost'] for item in vehicle['Powers']) + vehicle['SizeCost']
    text_widget.insert(tk.END, f"\nTotal points spent: {total_spent} of {points}\n")

def on_generate_vehicle_click(notebook, text_widgets):
    vehicle_points = simpledialog.askinteger("Vehicle Points", "How many Vehicle Points?", minvalue=1)
    
    if vehicle_points is not None:
        vehicle = create_vehicle(vehicle_points)

        new_tab = ttk.Frame(notebook)
        notebook.add(new_tab, text=f"Vehicle")
        vehicle_text = tk.Text(new_tab, height=15, width=50)
        vehicle_text.pack(expand=True, fill='both')
        text_widgets[new_tab] = vehicle_text

        display_vehicle(vehicle, vehicle_points, vehicle_text)
        notebook.select(new_tab)

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
