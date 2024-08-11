import tkinter as tk
from tkinter import ttk
from tkinter import messagebox
import random
import json

def load_data_from_json(file_path):
    """Load JSON data from a file."""
    with open(file_path, 'r') as file:
        return json.load(file)

def random_challenge(complication_name, complications):
    """Get a random challenge for the selected complication."""
    challenges = complications[complication_name].get('challenges', [])
    if challenges:
        return random.choice(challenges)
    return "No challenges available for this complication."

def open_complications_window(complications):
    """Open a new window for selecting complications and showing challenges."""
    def on_random_conflict():
        selected_complication = complication_var.get()
        if selected_complication:
            challenge = random_challenge(selected_complication, complications)
            messagebox.showinfo("Random Challenge", f"Challenge for {selected_complication}: {challenge}")
        else:
            messagebox.showwarning("Selection Error", "Please select a complication.")

    # Create a new window
    comp_window = tk.Toplevel()
    comp_window.title("Complications")

    # Dropdown menu for selecting a complication
    ttk.Label(comp_window, text="Select a Complication:").pack(pady=5)
    complication_var = tk.StringVar()
    complication_dropdown = ttk.Combobox(comp_window, textvariable=complication_var)
    complication_dropdown['values'] = list(complications.keys())
    complication_dropdown.pack(pady=5)

    # Button to get a random conflict
    random_button = ttk.Button(comp_window, text="Random Conflict", command=on_random_conflict)
    random_button.pack(pady=10)
