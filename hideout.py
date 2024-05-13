# hideout.py
import os
import random
import json
import tkinter as tk
from tkinter import messagebox, filedialog, ttk
import sqlite3

def generate_hideout(notebook, text_widgets):
    with open('headquarters.json', 'r') as file:
        headquarters_data = json.load(file)

    hq_size = random.choice(headquarters_data['headquarters']['sizes'])
    num_traits = random.randint(10, 20)
    
    selected_feature_ids = set()
    
    def get_unique_feature():
        while True:
            feature = random.choice(headquarters_data['headquarters']['traits'])
            if feature['id'] not in selected_feature_ids:
                selected_feature_ids.add(feature['id'])
                return feature

    hq_traits = [get_unique_feature() for _ in range(num_traits)]
    hq_toughness = random.choice(headquarters_data['headquarters']['toughness'])

    new_tab = ttk.Frame(notebook)
    notebook.add(new_tab, text="Hideout")
    
    hideout_summary_text = tk.Text(new_tab, height=15, width=50)
    hideout_summary_text.pack(expand=True, fill='both')
    hideout_summary_text.tag_configure("bold", font=("Helvetica", 12, "bold", "underline"))
    hideout_summary_text.tag_configure("bold_no_underline", font=("Helvetica", 10, "bold"))
    hideout_summary_text.tag_configure("normal_format", font=("Helvetica", 10))

    hideout_summary_text.insert("end", "Hideout Summary\n", "bold")
    hideout_summary_text.insert("end", "-" * 40 + "\n")
    hideout_summary_text.insert("end", f"\nSize: {hq_size}\n", "bold_no_underline")
    hideout_summary_text.insert("end", f"Toughness: {hq_toughness}\n", "bold_no_underline")
    hideout_summary_text.insert("end", "\nTraits:\n", "bold_no_underline")

    for trait in hq_traits:
        hideout_summary_text.insert("end", f"- {trait['name']}\n", "normal_format")
        hideout_summary_text.insert("end", f"  {trait['description']}\n\n", "normal_format")
    
    text_widgets[new_tab] = hideout_summary_text
    notebook.select(new_tab)

# Function to save hideout details to a file
def save_hideout(hideout_details):
    filename = filedialog.asksaveasfilename(
        defaultextension=".txt",
        filetypes=[("Text files", "*.txt")],
        initialdir=os.path.expanduser("~/Desktop")
    )
    
    if not filename:
        return  # User cancelled the save dialog

    with open(filename, 'w') as file:
        file.write("Hideout Summary\n")
        file.write("-" * 40 + "\n")
        file.write(f"\nSize: {hideout_details['Size']}\n")
        file.write(f"Toughness: {hideout_details['Toughness']}\n")
        file.write("\nTraits:\n")
        for trait in hideout_details['Traits']:
            file.write(f"- {trait}\n")

    messagebox.showinfo("Save Hideout", f"Hideout details saved to {filename}")
