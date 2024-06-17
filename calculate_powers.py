import tkinter as tk
from tkinter import ttk
import json

def calculate_power():
    try:
        base_cost = float(base_cost_entry.get() or 0)
        extras = float(extras_entry.get() or 0)
        flaws = float(flaws_entry.get() or 0)
        rank = int(rank_entry.get() or 0)
        flat_modifiers = float(flat_modifiers_entry.get() or 0)

        effect_cost = ((base_cost + extras - flaws) * rank) + flat_modifiers

        # Calculate fractional costs
        if base_cost + extras - flaws < 1:
            ranks_per_point = 1 / (base_cost + extras - flaws)
            effect_cost = (ranks_per_point * rank) + flat_modifiers
        else:
            effect_cost = ((base_cost + extras - flaws) * rank) + flat_modifiers

        component_cost_label.config(text=f"Component Cost: {effect_cost:.2f}")

    except ValueError:
        component_cost_label.config(text="Invalid input. Please enter valid numbers.")

def open_calculate_powers_window():
    global base_cost_entry, extras_entry, flaws_entry, rank_entry, flat_modifiers_entry, component_cost_label, notes_text

    calculate_powers_window = tk.Toplevel()
    calculate_powers_window.title("Calculate Powers")
    calculate_powers_window.geometry("400x500")

    with open('powers.json', 'r') as file:
        powers = json.load(file)

    power_names = [power['name'] for power in powers]

    power_name_label = tk.Label(calculate_powers_window, text="Power Name")
    power_name_label.pack()

    power_name_dropdown = ttk.Combobox(calculate_powers_window, values=power_names)
    power_name_dropdown.pack()

    base_cost_label = tk.Label(calculate_powers_window, text="Power Base Cost")
    base_cost_label.pack()

    base_cost_entry = tk.Entry(calculate_powers_window)
    base_cost_entry.pack()

    extras_label = tk.Label(calculate_powers_window, text="Extras")
    extras_label.pack()

    extras_entry = tk.Entry(calculate_powers_window)
    extras_entry.pack()

    flaws_label = tk.Label(calculate_powers_window, text="Flaws")
    flaws_label.pack()

    flaws_entry = tk.Entry(calculate_powers_window)
    flaws_entry.pack()

    rank_label = tk.Label(calculate_powers_window, text="Rank")
    rank_label.pack()

    rank_entry = tk.Entry(calculate_powers_window)
    rank_entry.pack()

    flat_modifiers_label = tk.Label(calculate_powers_window, text="Flat Modifiers")
    flat_modifiers_label.pack()

    flat_modifiers_entry = tk.Entry(calculate_powers_window)
    flat_modifiers_entry.pack()

    calculate_button = tk.Button(calculate_powers_window, text="Calculate Power", command=calculate_power)
    calculate_button.pack()

    component_cost_label = tk.Label(calculate_powers_window, text="Component Cost: ")
    component_cost_label.pack()

    notes_label = tk.Label(calculate_powers_window, text="Notes")
    notes_label.pack()

    notes_text = tk.Text(calculate_powers_window, wrap='word', height=10)
    notes_text.pack(fill='both', expand=True)

