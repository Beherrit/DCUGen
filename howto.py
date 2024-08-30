import tkinter as tk
from tkinter import ttk
from tooltip import ToolTip
import ttkbootstrap as ttk
from ttkbootstrap.constants import *

class HowToApp:
    def __init__(self, master):
        self.master = master
        self.master.title("Guides / How To")

        # Use the current theme
        self.style = ttk.Style()

        self.main_frame = ttk.Frame(self.master)
        self.main_frame.pack(fill='both', expand=True)

        self.button_frame = ttk.Frame(self.main_frame)
        self.button_frame.pack(pady=10)

        self.character_management_button = ttk.Button(self.button_frame, text="Character Management Guide", command=self.character_management_guide, style='primary.TButton')
        self.character_management_button.pack(side='top', padx=5, pady=5)
        ToolTip(self.character_management_button, "Learn how to manage characters, including creation and deletion.")

        self.equipment_management_button = ttk.Button(self.button_frame, text="Equipment Management Guide", command=self.equipment_management_guide, style='primary.TButton')
        self.equipment_management_button.pack(side='top', padx=5, pady=5)
        ToolTip(self.equipment_management_button, "Guidelines for managing and allocating equipment points.")

        self.vehicle_management_button = ttk.Button(self.button_frame, text="Vehicle Management Guide", command=self.vehicle_management_guide, style='primary.TButton')
        self.vehicle_management_button.pack(side='top', padx=5, pady=5)
        ToolTip(self.vehicle_management_button, "Guide to creating and managing vehicles.")

        self.hideout_management_button = ttk.Button(self.button_frame, text="Hideout Management Guide", command=self.hideout_management_guide, style='primary.TButton')
        self.hideout_management_button.pack(side='top', padx=5, pady=5)
        ToolTip(self.hideout_management_button, "Instructions for generating and saving hideout details.")

        self.miscellaneous_guides_button = ttk.Button(self.button_frame, text="Miscellaneous Guides", command=self.miscellaneous_guides, style='primary.TButton')
        self.miscellaneous_guides_button.pack(side='top', padx=5, pady=5)
        ToolTip(self.miscellaneous_guides_button, "Access guides for encounters, settings, and more.")

        self.reference_management_button = ttk.Button(self.button_frame, text="Reference Management", command=self.reference_management_guide, style='primary.TButton')
        self.reference_management_button.pack(side='top', padx=5, pady=5)
        ToolTip(self.reference_management_button, "Manage and calculate powers, reference data, and notes.")

        self.gm_cheat_sheet_button = ttk.Button(self.button_frame, text="GM Cheat Sheet Guide", command=self.gm_cheat_sheet_guide, style='primary.TButton')
        self.gm_cheat_sheet_button.pack(side='top', padx=5, pady=5)
        ToolTip(self.gm_cheat_sheet_button, "Quick reference and tips for game masters.")

    def character_management_guide(self):
        self.show_guide("Character Management Guide", """
        Character Management Guide:
        1. Generate Character Filters: Opens a window to set filters and generate a character.
        2. Export to Character Sheet: Exports the generated character data to a character sheet.
        3. Close Tab: Closes the current tab in the notebook.
        4. Close All Tabs: Closes all open tabs in the notebook.
        5. Select AI Prompt: Copies the AI prompt for the character to the clipboard.
        """)

    def equipment_management_guide(self):
        self.show_guide("Equipment Management Guide", """
        Equipment Management Guide:
        1. Equipment Points: Input the number of equipment points available.
        2. Generate Equipment: Generates equipment based on the specified points.
        3. Save Equipment: Saves the generated equipment.
        """)

    def vehicle_management_guide(self):
        self.show_guide("Vehicle Management Guide", """
        Vehicle Management Guide:
        1. Vehicle Points: Input the number of vehicle points available.
        2. Generate Vehicle: Generates a vehicle based on the specified points.
        3. Save Vehicle: Saves the generated vehicle.
        """)

    def hideout_management_guide(self):
        self.show_guide("Hideout Management Guide", """
        Hideout Management Guide:
        1. Generate Hideout: Generates a hideout.
        2. Save Hideout: Saves the generated hideout details.
        """)

    def miscellaneous_guides(self):
        self.show_guide("Miscellaneous Guides", """
        Miscellaneous Guides:
        1. Generate Encounter: Generates a random encounter.
        2. Initiative Tracker: Opens the initiative tracker for managing combat encounters.
        3. Settings: Opens the settings window to configure application settings.
        """)

    def reference_management_guide(self):
        self.show_guide("Reference Management Guide", """
        Reference Management Guide:
        1. Calculate Powers: Opens the power calculation window.
        2. Reference Data: Opens the reference data window.
        3. Notes: Opens the notes window to manage notes.
        """)

    def gm_cheat_sheet_guide(self):
        self.show_guide("GM Cheat Sheet Guide", """
        GM Cheat Sheet Guide:
        1. Add New Character: Opens a form to manually input character data.
        2. Upload Character: Uploads the character data from the current tab to the GM Cheat Sheet.
        3. Save Sheet: Saves the GM Cheat Sheet to a JSON file.
        4. Upload Sheet: Uploads a GM Cheat Sheet from a JSON file.

        Adding Skills and Powers in Manual Load:
        - To add skills, enter the skills in the following format: "SkillName:Rank" (e.g., "Acrobatics:3, Athletics:2").
        - To add powers, enter the powers in the following format: "PowerName:Rank" (e.g., "Fly:2, Invisibility:3").
        - Separate multiple skills or powers with a comma.
        """)

    def show_guide(self, title, content):
        guide_window = ttk.Toplevel(self.master)
        guide_window.title(title)
        guide_text = ttk.Text(guide_window, wrap='word', height=15, width=50)
        guide_text.pack(expand=True, fill='both')
        guide_text.insert('1.0', content)
        guide_text.config(state='disabled')

if __name__ == "__main__":
    root = ttk.Window(themename="darkly")
    app = HowToApp(root)
    root.mainloop()