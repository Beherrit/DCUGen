import os
import random
import json
import tkinter as tk
from tkinter import messagebox, filedialog, ttk

def load_gadgets():
    with open('./json/gadget_data.json', 'r', encoding='utf-8') as json_file:
        return json.load(json_file)

def calculate_equipment_points(character):
    equipment_advantage = next((adv for adv in character['advantages'] if adv['name'] == 'Equipment'), None)
    if equipment_advantage:
        rank = equipment_advantage['rank']
        equipment_points = rank * 5  # Each rank of Equipment provides 5 equipment points
        return equipment_points
    return 0

def random_gadget_generator(points, gadgets):
    selected_gadgets = []
    total_cost = 0

    while points > 0 and gadgets:
        chosen_gadget = random.choice(gadgets).copy()  # Copy the gadget to avoid modifying the original list
        chosen_gadget['total_cost'] = 0  # Set default total_cost

        if 'cost' in chosen_gadget:  # Check if 'cost' key exists
            base_cost = int(chosen_gadget['cost'])

            if base_cost <= points:
                if 'rank' in chosen_gadget and isinstance(chosen_gadget['rank'], str):
                    rank_range = [int(x) for x in chosen_gadget['rank'].split('-') if x.isdigit()]
                    if len(rank_range) == 2:
                        max_rank = min(rank_range[1], points // base_cost)  # Adjust max rank based on remaining points
                        if rank_range[0] <= max_rank:
                            chosen_rank = random.randint(rank_range[0], max_rank)
                            chosen_gadget['total_cost'] = chosen_rank * base_cost
                            chosen_gadget['rank'] = chosen_rank
                        else:
                            gadgets = [g for g in gadgets if g['name'] != chosen_gadget['name']]
                            continue
                    else:
                        chosen_gadget['rank'] = base_cost
                        chosen_gadget['total_cost'] = base_cost
                else:
                    chosen_gadget['rank'] = base_cost
                    chosen_gadget['total_cost'] = base_cost

                total_cost += chosen_gadget['total_cost']
                points -= chosen_gadget['total_cost']
                selected_gadgets.append(chosen_gadget)
                gadgets = [g for g in gadgets if g['name'] != chosen_gadget['name']]
            else:
                gadgets = [g for g in gadgets if g['name'] != chosen_gadget['name']]
        else:
            gadgets = [g for g in gadgets if g['name'] != chosen_gadget['name']]

    return selected_gadgets, total_cost

def display_gadgets(items, total_cost, allocated_points, text_widget):
    text_widget.delete("1.0", tk.END)
    
    for item in items:
        text_widget.insert(tk.END, f"{item['name']}\n")
        if 'description' in item:
            text_widget.insert(tk.END, f"- Description: {item['description']}\n")
        if 'effects' in item:
            text_widget.insert(tk.END, f"- Effect: {', '.join(item['effects'])}\n")
        if 'speed' in item:
            text_widget.insert(tk.END, f"- Speed: {item['speed']}\n")    
        if 'total_cost' in item:
            text_widget.insert(tk.END, f"- Cost: {item['cost']}, Rank: {item['rank']}, Total Cost: {item['total_cost']}\n")
        text_widget.insert(tk.END, "\n")
    
    text_widget.insert(tk.END, f"Total cost spent: {total_cost} of {allocated_points}\n")

def save_to_txt(items, filename):
    with open(filename, 'w') as file:
        for item in items:
            file.write(f"{item['name']}\n")
            if 'description' in item:
                file.write(f"- Description: {item['description']}\n")
            if 'effects' in item and isinstance(item['effects'], list):
                file.write(f"- Effect: {', '.join(item['effects'])}\n")
            if 'total_cost' in item:
                file.write(f"- Cost: {item['cost']}, Rank: {item['rank']}, Total Cost: {item['total_cost']}\n")
            file.write("\n")

def on_generate_equipment_click(equipment_points_entry, notebook, text_widgets):
    points = int(equipment_points_entry.get())
    gadgets = load_gadgets()
    items, total_cost = random_gadget_generator(points, gadgets)

    new_tab = ttk.Frame(notebook)
    notebook.add(new_tab, text=f"Equipment")
    equipment_text = tk.Text(new_tab, height=15, width=50)
    equipment_text.pack(expand=True, fill='both')
    text_widgets[new_tab] = equipment_text

    display_gadgets(items, total_cost, points, equipment_text)

def on_save_equipment_click(notebook, text_widgets):
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
            messagebox.showinfo("Save Equipment", f"Equipment saved to {filename}")

def save_equipment(notebook, text_widgets):
    selected_tab = notebook.nametowidget(notebook.select())
    text_widget = text_widgets.get(selected_tab)

    if text_widget and text_widget.get("1.0", tk.END).strip():
        content = text_widget.get("1.0", tk.END)
        filename = filedialog.asksaveasfilename(
            defaultextension=".txt",
            filetypes=[("Text files", "*.txt")],
            initialdir=os.path.expanduser("~/Desktop")
        )
        if filename:
            save_to_txt(content, filename)
            messagebox.showinfo("Save Equipment", f"Equipment saved to {filename}")
    else:
        messagebox.showerror("Error", "Please generate equipment before saving.")

def get_items_by_names(items_dict, names):
    return [items_dict[name] for name in names if name in items_dict]
