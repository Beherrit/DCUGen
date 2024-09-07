import os
import random
import json
import tkinter as tk
from tkinter import messagebox, filedialog, ttk
from typing import Dict, List, Any

def generate_hideout(notebook: ttk.Notebook, text_widgets: Dict[Any, tk.Text]) -> Dict[str, Any]:
    with open('./json/headquarters.json', 'r') as file:
        headquarters_data = json.load(file)

    hq_size = random.choice(headquarters_data['headquarters']['sizes'])
    num_traits = random.randint(10, 20)
    
    selected_feature_ids = set()
    hideout_details = {
        'Size': hq_size,
        'Toughness': random.choice(headquarters_data['headquarters']['toughness']),
        'Traits': []
    }

    def get_unique_feature():
        while True:
            feature = random.choice(headquarters_data['headquarters']['traits'])
            if feature['id'] not in selected_feature_ids:
                selected_feature_ids.add(feature['id'])
                return feature

    hq_traits = [get_unique_feature() for _ in range(num_traits)]
    hideout_details['Traits'] = [trait['name'] for trait in hq_traits]

    new_tab = ttk.Frame(notebook)
    notebook.add(new_tab, text="Hideout")
    
    hideout_summary_text = tk.Text(new_tab, height=15, width=50)
    hideout_summary_text.pack(expand=True, fill='both')
    
    for tag, font in [
        ("title", ("Helvetica", 12, "bold", "underline")),
        ("subtitle", ("Helvetica", 10, "bold")),
        ("normal", ("Helvetica", 10))
    ]:
        hideout_summary_text.tag_configure(tag, font=font)

    hideout_summary_text.insert("end", "Hideout Summary\n", "title")
    hideout_summary_text.insert("end", "-" * 40 + "\n\n")
    hideout_summary_text.insert("end", f"Size: {hq_size}\n", "subtitle")
    hideout_summary_text.insert("end", f"Toughness: {hideout_details['Toughness']}\n\n", "subtitle")
    hideout_summary_text.insert("end", "Traits:\n", "subtitle")

    for trait in hq_traits:
        hideout_summary_text.insert("end", f"- {trait['name']}\n", "normal")
        hideout_summary_text.insert("end", f"  {trait['description']}\n\n", "normal")
    
    text_widgets[new_tab] = hideout_summary_text
    notebook.select(new_tab)

    return hideout_details

def save_hideout(hideout_details: Dict[str, Any]) -> None:
    filename = filedialog.asksaveasfilename(
        defaultextension=".txt",
        filetypes=[("Text files", "*.txt")],
        initialdir=os.path.expanduser("~/Desktop")
    )
    
    if not filename:
        return

    with open(filename, 'w') as file:
        file.write("Hideout Summary\n")
        file.write("-" * 40 + "\n\n")
        file.write(f"Size: {hideout_details['Size']}\n")
        file.write(f"Toughness: {hideout_details['Toughness']}\n\n")
        file.write("Traits:\n")
        for trait in hideout_details['Traits']:
            file.write(f"- {trait}\n")

    messagebox.showinfo("Save Hideout", f"Hideout details saved to {filename}")
