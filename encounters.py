import json
import random
import tkinter as tk
from tkinter import ttk

def load_data_from_json(file_path):
    with open(file_path, 'r') as f:
        return json.load(f)

class EncounterSelector(tk.Toplevel):
    def __init__(self, master, encounter_data):
        super().__init__(master)
        self.title("Select Encounter Type")
        self.encounter_data = encounter_data
        self.selected_difficulties = []

        # Define the difficulty options and encounter types
        self.difficulty_vars = {
            "Easy": tk.BooleanVar(),
            "Medium": tk.BooleanVar(),
            "Hard": tk.BooleanVar(),
            "Heroic": tk.BooleanVar(),
        }

        self.create_widgets()

    def create_widgets(self):
        tk.Label(self, text="Select Encounter Difficulties:").pack(pady=10)

        # Create checkboxes for each difficulty level
        for difficulty in self.difficulty_vars:
            tk.Checkbutton(
                self,
                text=difficulty,
                variable=self.difficulty_vars[difficulty]
            ).pack(anchor=tk.W, padx=20)

        # Add a generate button
        generate_button = tk.Button(self, text="Generate", command=self.generate_encounter)
        generate_button.pack(pady=10)

        # Add a Text widget to display generated encounters
        self.encounter_display = tk.Text(self, height=10, width=50, wrap="word")
        self.encounter_display.pack(pady=10)

    def generate_encounter(self):
        # Clear the display area
        self.encounter_display.delete('1.0', tk.END)

        # Get the selected difficulties
        self.selected_difficulties = [key for key, var in self.difficulty_vars.items() if var.get()]

        if not self.selected_difficulties:
            self.encounter_display.insert(tk.END, "Please select at least one encounter difficulty.\n")
            return

        # Filter encounters based on selected difficulties
        possible_encounters = [
            encounter for encounter in self.encounter_data
            if encounter['type'] in self.selected_difficulties
        ]

        if possible_encounters:
            encounter = random.choice(possible_encounters)
            self.encounter_display.insert(tk.END, f"Encounter Type: {encounter['type']}\nDescription: {encounter['description']}\n")
        else:
            self.encounter_display.insert(tk.END, "No encounters available for the selected difficulties.\n")

def generate_encounter():
    encounters = load_data_from_json('./json/encounters.json')['encounters']
    EncounterSelector(master=None, encounter_data=encounters)
