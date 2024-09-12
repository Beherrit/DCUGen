import tkinter as tk
from tkinter import filedialog, messagebox
import json
from typing import Dict, Any, Callable
import ttkbootstrap as ttk
from ttkbootstrap.constants import *
from ttkbootstrap.scrolled import ScrolledFrame
import os
from openpyxl import load_workbook
from PIL import Image, ImageTk
from initiative_tracker import open_initiative_tracker, update_initiative_tracker
from tooltip import ToolTip

class GMSheetApp:
    def __init__(self, master: ttk.Window, main_notebook: ttk.Notebook, characters: Dict[str, Any]):
        self.master = master
        self.master.title("GM Cheat Sheet")
        self.master.geometry("800x600")
        self.main_notebook = main_notebook
        self.characters = characters
        self.displayed_characters: Dict[str, ttk.Frame] = {}

        self.auto_save_file = "gm_sheet_autosave.json"
        self.init_tracker_window = None  # Add this line to store the Initiative Tracker window

        self.setup_styles()
        self.setup_ui()
        self.load_autosave()

    def setup_styles(self):
        self.style = ttk.Style()
        self.style.configure("TLabel", font=("Helvetica", 10))
        self.style.configure("TButton", font=("Helvetica", 10))
        self.style.configure("Header.TLabel", font=("Helvetica", 12, "bold"))
        self.style.configure("Body.TLabel", font=("Helvetica", 10))

    def setup_ui(self):
        self.scrolled_frame = ScrolledFrame(self.master)
        self.scrolled_frame.pack(fill=BOTH, expand=YES)

        self.setup_buttons()
        self.character_notebook = ttk.Notebook(self.scrolled_frame)
        self.character_notebook.pack(fill=BOTH, expand=YES)
        self.character_notebook.bind("<Button-3>", self.show_context_menu)

    def setup_buttons(self):
        button_frame = ttk.Frame(self.scrolled_frame)
        button_frame.pack(fill=X, expand=YES, pady=10, padx=10)

        buttons = [
            ("Add New Character", self.add_new_character, "info", "Create a new character manually"),
            ("Import Character", self.import_character, "info", "Import a character from an Excel file"),
            ("Upload Image", self.upload_image, "info", "Upload an image for the selected character"),
            ("Tab Upload", self.upload_character, "info", "Upload the character from the current tab"),
            ("Upload All Tabs", self.upload_all_characters, "info", "Upload all characters from all tabs"),
            ("Export Save", self.save_sheet, "success", "Save all characters to a JSON file"),
            ("Import Save", self.upload_sheet, "success", "Load characters from a saved JSON file"),
            ("Upload to Init Tracker", self.upload_to_init_tracker, "warning", "Send characters to the Initiative Tracker"),
            ("Clear GM Screen", self.clear_gm_screen, "danger", "Remove all characters from the GM Screen")
        ]

        for i, (text, command, style, tooltip_text) in enumerate(buttons):
            row = i // 3
            col = i % 3
            button = ttk.Button(button_frame, text=text, command=command, style=f"{style}.TButton", width=15)
            button.grid(row=row, column=col, padx=5, pady=5, sticky="nsew")
            ToolTip(button, tooltip_text)

        # Configure grid to expand buttons evenly
        for i in range(3):
            button_frame.columnconfigure(i, weight=1)

    def add_new_character(self):
        new_window = ttk.Toplevel(self.master)
        new_window.title("Add New Character")
        new_window.geometry("400x600")
        CharacterForm(new_window, self.characters, self.display_character).pack(fill=BOTH, expand=YES, padx=20, pady=20)

    def upload_character(self):
        current_tab = self.main_notebook.select()
        tab_text = self.main_notebook.tab(current_tab, "text")
        if tab_text in self.characters:
            self.display_character(self.characters[tab_text])
            self.auto_save()
        else:
            messagebox.showerror("Error", "No character data found for the current tab")

    def upload_all_characters(self):
        for tab in self.main_notebook.tabs():
            tab_text = self.main_notebook.tab(tab, "text")
            if tab_text in self.characters:
                self.display_character(self.characters[tab_text])
        self.auto_save()
        messagebox.showinfo("Success", "All characters from tabs have been uploaded to the GM Cheat Sheet.")

    def display_character(self, character_data: Dict[str, Any]):
        name = character_data["name"]
        if name in self.displayed_characters:
            self.character_notebook.forget(self.displayed_characters[name])

        char_frame = ttk.Frame(self.character_notebook)
        self.character_notebook.add(char_frame, text=name)

        # Image display
        image_frame = ttk.Frame(char_frame)
        image_frame.pack(fill=X, expand=YES, padx=5, pady=5, anchor=W)
        self.display_character_image(image_frame, character_data.get("image_path"))

        sections = self.get_character_sections(character_data)

        for section, items in sections.items():
            section_frame = ttk.LabelFrame(char_frame, text=section)
            section_frame.pack(fill=X, expand=YES, padx=5, pady=5)

            for name, value in items:
                item_frame = ttk.Frame(section_frame)
                item_frame.pack(fill=X, padx=5, pady=2)
                ttk.Label(item_frame, text=name, width=15, style="Body.TLabel").pack(side=LEFT, anchor=N)
                if section == "Powers":
                    ttk.Label(item_frame, text=value, style="Body.TLabel", wraplength=400).pack(side=LEFT, fill=X, expand=YES)
                else:
                    ttk.Label(item_frame, text=value, style="Body.TLabel").pack(side=LEFT)

        self.displayed_characters[name] = char_frame
        self.character_notebook.select(char_frame)
        self.auto_save()

    def get_character_sections(self, character_data: Dict[str, Any]) -> Dict[str, list]:
        return {
            "Basic": [
                ("Name", character_data.get("name", "")),
                ("Theme", character_data.get("theme", "")),
                ("Initiative", character_data.get("initiative", ""))
            ],
            "Attributes": [
                (attr, character_data.get("stats", {}).get(attr, {}).get("value", ""))
                for attr in ["Strength", "Agility", "Fighting", "Stamina", "Intellect", "Awareness", "Presence", "Dexterity"]
            ],
            "Defenses": [
                (defense, character_data.get("defenses", {}).get(defense, {}).get("total_rank", ""))
                for defense in ["Dodge", "Fortitude", "Parry", "Will", "Toughness"]
            ],
            "Skills": [(skill["name"], skill["rank"]) for skill in character_data.get("skills", [])],
            "Advantages": [(advantage["name"], advantage["rank"]) for advantage in character_data.get("advantages", [])],
            "Powers": [(power['name'], 
                        f"Rank: {power['rank']}, "
                        f"Flaws: {', '.join(f'{flaw} ({rank})' for flaw, rank in zip(power.get('flaws', []), power.get('flaws_ranks', [])))}, "
                        f"Extras: {', '.join(f'{extra} ({rank})' for extra, rank in zip(power.get('extras', []), power.get('extras_ranks', [])))}, "
                        f"Range: {power.get('range', 'Close')}")
                       for power in character_data.get("powers", [])],
        }

    def confirm_delete(self, name: str):
        if messagebox.askyesno("Confirm Delete", f"Are you sure you want to remove {name} from the GM Cheat Sheet?"):
            self.delete_character(name)

    def delete_character(self, name):
        if name in self.displayed_characters:
            self.displayed_characters[name].destroy()  # Remove the character's frame
            del self.displayed_characters[name]  # Remove from displayed_characters dictionary
        if name in self.characters:
            del self.characters[name]  # Remove from the main characters dictionary
        self.auto_save()
        self.refresh_display()  # Refresh the display to reflect the changes
        self.scrolled_frame.yview_moveto(0)  # Scroll to the top
        messagebox.showinfo("Success", f"Character '{name}' removed from GM Cheat Sheet.")

    def refresh_display(self):
        for tab in self.character_notebook.tabs():
            self.character_notebook.forget(tab)
        self.displayed_characters.clear()
        for data in self.characters.values():
            self.display_character(data)

    def save_sheet(self):
        save_path = filedialog.asksaveasfilename(defaultextension=".json", filetypes=[("JSON files", "*.json")])
        if save_path:
            with open(save_path, 'w') as file:
                json.dump(self.characters, file)
            messagebox.showinfo("Save Sheet", f"Sheet saved to {save_path}")

    def upload_sheet(self):
        load_path = filedialog.askopenfilename(filetypes=[("JSON files", "*.json")])
        if load_path:
            with open(load_path, 'r') as file:
                loaded_characters = json.load(file)
                self.characters.update(loaded_characters)
                self.refresh_display()
            self.auto_save()
            messagebox.showinfo("Upload Sheet", f"Sheet uploaded from {load_path}")

    def upload_to_init_tracker(self):
        init_tracker_data = []
        for character_data in self.characters.values():
            name = character_data.get("name", "")
            awareness = character_data.get("stats", {}).get("Awareness", {}).get("value", 0)
            agility = character_data.get("stats", {}).get("Agility", {}).get("value", 0)
            initiative = character_data.get("initiative", "")
            
            init_tracker_data.append((name, awareness, agility, initiative))
        
        if self.init_tracker_window is None or not self.init_tracker_window.winfo_exists():
            self.init_tracker_window = open_initiative_tracker(self.main_notebook, self.characters, init_tracker_data)
        else:
            update_initiative_tracker(self.init_tracker_window, init_tracker_data)
        messagebox.showinfo("Success", "All characters have been uploaded to the Initiative Tracker.")

    def load_autosave(self):
        if os.path.exists(self.auto_save_file):
            with open(self.auto_save_file, 'r') as file:
                loaded_characters = json.load(file)
                self.characters.update(loaded_characters)
            self.refresh_display()

    def auto_save(self):
        with open(self.auto_save_file, 'w') as file:
            json.dump(self.characters, file)

    def import_character(self):
        file_path = filedialog.askopenfilename(filetypes=[("Excel files", "*.xlsx")])
        if file_path:
            try:
                wb = load_workbook(filename=file_path)
                sheet = wb.active
                
                character_data = {
                    "name": sheet['K2'].value,
                    "gender": sheet['AP2'].value,
                    "age": sheet['BD2'].value,
                    "power_level": sheet['W33'].value,
                    "theme": sheet['AD26'].value,
                    "languages": sheet['R38'].value.split(", ") if sheet['R38'].value else [],
                    "origin": {
                        "region": sheet['G93'].value.split(" | ")[0] if sheet['G93'].value else "",
                        "country": sheet['G93'].value.split(" | ")[1] if sheet['G93'].value and len(sheet['G93'].value.split(" | ")) > 1 else "",
                        "language": sheet['G93'].value.split(" | ")[2] if sheet['G93'].value and len(sheet['G93'].value.split(" | ")) > 2 else ""
                    },
                    "physical_traits": {
                        "height": sheet['BE5'].value,
                        "weight": sheet['BE8'].value,
                        "eye_color": sheet['AP5'].value,
                        "hair_color": sheet['AP8'].value
                    },
                    "stats": {
                        "Strength": {"value": sheet['N18'].value},
                        "Agility": {"value": sheet['N26'].value},
                        "Fighting": {"value": sheet['N34'].value},
                        "Awareness": {"value": sheet['N42'].value},
                        "Stamina": {"value": sheet['N22'].value},
                        "Dexterity": {"value": sheet['N30'].value},
                        "Intellect": {"value": sheet['N38'].value},
                        "Presence": {"value": sheet['N46'].value}
                    },
                    "defenses": {
                        "Dodge": {"total_rank": sheet['Z18'].value},
                        "Parry": {"total_rank": sheet['Z24'].value},
                        "Fortitude": {"total_rank": sheet['Z21'].value},
                        "Toughness": {"total_rank": sheet['Z30'].value},
                        "Will": {"total_rank": sheet['Z27'].value}
                    },
                    "initiative": sheet['AK18'].value,
                    "total_cost": int(sheet['AD33'].value) if sheet['AD33'].value else 0,
                    "personality_traits": {
                        "positive_traits": [],
                        "negative_traits": [],
                        "quirky_traits": []
                    },
                    "powers": [],
                    "advantages": [],
                    "skills": [],
                    "Motivation": {"name": "", "description": ""},
                    "Complications": []
                }

                # Extract personality traits
                all_traits = sheet['AK90'].value
                if all_traits:
                    traits = all_traits.split("|")
                    character_data["personality_traits"]["positive_traits"] = traits[0].strip().split(", ")
                    character_data["personality_traits"]["negative_traits"] = traits[1].strip().split(", ")
                    character_data["personality_traits"]["quirky_traits"] = traits[2].strip().split(", ")

                # Extract powers
                for row in range(54, 84, 3):
                    power_cell = f'B{row}'
                    if sheet[power_cell].value:
                        power_details = sheet[power_cell].value.split("|")
                        power_name = power_details[0].strip()
                        power_rank = int(power_details[1].split(":")[1].strip())
                        
                        # Initialize extras, flaws, and range
                        extras = ""
                        flaws = ""
                        power_range = "Close"  # Default to Close if not specified
                        
                        # Extract extras, flaws, and range from the power details
                        for detail in power_details[2:]:
                            if "Extras:" in detail:
                                extras = detail.split("Extras:")[1].strip()
                            elif "Flaws:" in detail:
                                flaws = detail.split("Flaws:")[1].strip()
                            elif "Range:" in detail:
                                power_range = detail.split("Range:")[1].strip()
                        
                        power = {
                            "name": power_name,
                            "rank": power_rank,
                            "extras": extras,
                            "flaws": flaws,
                            "range": power_range
                        }
                        character_data["powers"].append(power)

                # Extract advantages
                for row in range(104, 142, 2):
                    name_cell = f'X{row}'
                    rank_cell = f'AE{row}'
                    if sheet[name_cell].value:
                        advantage = {
                            "name": sheet[name_cell].value,
                            "rank": sheet[rank_cell].value
                        }
                        character_data["advantages"].append(advantage)

                # Extract skills
                skill_cells = {
                    "Acrobatics": "P104", "Athletics": "P106", "Close Combat": "P110",
                    "Deception": "P118", "Expertise": "P120", "Insight": "P130",
                    "Intimidation": "P132", "Investigation": "P134", "Perception": "P136",
                    "Persuasion": "P138", "Ranged Combat": "P140", "Stealth": "P150",
                    "Technology": "P152", "Treatment": "P154", "Vehicles": "P156",
                    "Sleight of Hand": "P148"
                }
                for skill_name, cell in skill_cells.items():
                    if sheet[cell].value:
                        skill = {
                            "name": skill_name,
                            "rank": sheet[cell].value
                        }
                        character_data["skills"].append(skill)

                # Extract Motivation and Complications
                motivation = sheet['F88'].value
                if motivation:
                    parts = motivation.split(":")
                    character_data["Motivation"]["name"] = parts[0].strip()
                    character_data["Motivation"]["description"] = ":".join(parts[1:]).strip()

                for cell in ['F90', 'AK88']:
                    complication = sheet[cell].value
                    if complication:
                        parts = complication.split(":")
                        character_data["Complications"].append({
                            "name": parts[0].strip(),
                            "description": ":".join(parts[1:]).strip()
                        })

                # Add the imported character to the GM Cheat Sheet
                self.characters[character_data["name"]] = character_data
                self.display_character(character_data)
                self.auto_save()
                messagebox.showinfo("Import Successful", f"Character '{character_data['name']}' has been imported and added to the GM Cheat Sheet.")
            
            except Exception as e:
                messagebox.showerror("Import Error", f"An error occurred while importing the character: {str(e)}")

    def display_character_image(self, frame, image_path):
        if image_path and os.path.exists(image_path):
            img = Image.open(image_path)
            img = img.resize((100, 100), Image.LANCZOS)  # Resize image
            photo = ImageTk.PhotoImage(img)
            img_label = ttk.Label(frame, image=photo, cursor="hand2")
            img_label.image = photo  # Keep a reference
            img_label.pack(side=LEFT, pady=5)
            img_label.bind("<Button-1>", lambda e: self.open_large_image(image_path))
        else:
            ttk.Label(frame, text="No image", style="Body.TLabel").pack(side=LEFT, pady=5)

    def upload_image(self):
        current_tab = self.character_notebook.select()
        if not current_tab:
            messagebox.showerror("Error", "No character tab selected")
            return

        character_name = self.character_notebook.tab(current_tab, "text")
        if character_name not in self.characters:
            messagebox.showerror("Error", "Character not found")
            return

        file_path = filedialog.askopenfilename(filetypes=[("Image files", "*.png;*.jpg;*.jpeg;*.gif")])
        if file_path:
            self.characters[character_name]["image_path"] = file_path
            self.refresh_display()
            self.auto_save()
            messagebox.showinfo("Success", f"Image uploaded for {character_name}")

    def open_large_image(self, image_path):
        if image_path and os.path.exists(image_path):
            img = Image.open(image_path)
            max_size = (800, 600)  # Maximum size for the large image
            img.thumbnail(max_size, Image.LANCZOS)
            
            top = ttk.Toplevel(self.master)
            top.title("Character Image")
            
            photo = ImageTk.PhotoImage(img)
            label = ttk.Label(top, image=photo)
            label.image = photo  # Keep a reference
            label.pack(padx=10, pady=10)

    def show_context_menu(self, event):
        try:
            tab = self.character_notebook.identify(event.x, event.y)
            if tab:
                index = self.character_notebook.index(f"@{event.x},{event.y}")
                character_name = self.character_notebook.tab(index, "text")
                menu = ttk.Menu(self.master, tearoff=0)
                menu.add_command(label=f"Delete {character_name}", 
                                command=lambda: self.confirm_delete(character_name))
                menu.tk_popup(event.x_root, event.y_root)
        except Exception as e:
            print(f"Error in show_context_menu: {e}")

    def confirm_delete(self, name: str):
        if messagebox.askyesno("Confirm Delete", f"Are you sure you want to remove {name} from the GM Cheat Sheet?"):
            self.delete_character(name)

    def clear_gm_screen(self):
        if messagebox.askyesno("Confirm Clear", "Are you sure you want to clear all characters from the GM Screen?"):
            self.characters.clear()
            self.displayed_characters.clear()
            for tab in self.character_notebook.tabs():
                self.character_notebook.forget(tab)
            self.auto_save()
            messagebox.showinfo("Success", "GM Screen has been cleared.")

class CharacterForm(ttk.Frame):
    def __init__(self, master: ttk.Toplevel, characters: Dict[str, Any], display_character_callback: Callable):
        super().__init__(master)
        self.characters = characters
        self.display_character_callback = display_character_callback
        self.load_json_data()
        self.create_form()

    def load_json_data(self):
        json_files = {
            'skills': 'json/skills.json',
            'advantages': 'json/advantages.json',
            'powers': 'json/powers.json',
            'extras': 'json/extras.json',
            'flaws': 'json/flaws.json'
        }

        for attr, file_path in json_files.items():
            try:
                with open(file_path, 'r') as f:
                    setattr(self, f'{attr}_data', json.load(f))
            except FileNotFoundError:
                messagebox.showerror("Error", f"{file_path} not found.")
                setattr(self, f'{attr}_data', [])
            except json.JSONDecodeError:
                messagebox.showerror("Error", f"Invalid JSON in {file_path}.")
                setattr(self, f'{attr}_data', [])

        # Ensure all attributes are set, even if loading failed
        for attr in json_files.keys():
            if not hasattr(self, f'{attr}_data'):
                setattr(self, f'{attr}_data', [])

    def create_form(self):
        notebook = ttk.Notebook(self)
        notebook.pack(fill=BOTH, expand=YES)

        basic_frame = ttk.Frame(notebook)
        attributes_frame = ttk.Frame(notebook)
        defenses_frame = ttk.Frame(notebook)
        skills_frame = ttk.Frame(notebook)
        advantages_frame = ttk.Frame(notebook)
        powers_frame = ttk.Frame(notebook)

        notebook.add(basic_frame, text="Basic")
        notebook.add(attributes_frame, text="Attributes")
        notebook.add(defenses_frame, text="Defenses")
        notebook.add(skills_frame, text="Skills")
        notebook.add(advantages_frame, text="Advantages")
        notebook.add(powers_frame, text="Powers")

        basic_fields = ["Name", "Initiative", "Theme"]
        attribute_fields = ["Strength", "Agility", "Fighting", "Stamina", "Intellect", "Awareness", "Presence", "Dexterity"]
        defense_fields = ["Dodge", "Fortitude", "Parry", "Will", "Toughness"]

        self.entries = {}

        self.create_fields(basic_frame, basic_fields)
        self.create_fields(attributes_frame, attribute_fields)
        self.create_fields(defenses_frame, defense_fields)
        self.create_skills_section(skills_frame)
        self.create_advantages_section(advantages_frame)
        self.create_powers_section(powers_frame)

        ttk.Button(self, text="Save to GM Cheat Sheet", command=self.save_character, 
                   style="success.TButton").pack(pady=20)

    def create_fields(self, parent, fields):
        for field in fields:
            frame = ttk.Frame(parent)
            frame.pack(fill=X, padx=10, pady=5)
            ttk.Label(frame, text=field, width=15).pack(side=LEFT)
            entry = ttk.Entry(frame)
            entry.pack(side=LEFT, expand=YES, fill=X)
            self.entries[field] = entry

    def create_skills_section(self, parent):
        frame = ttk.Frame(parent)
        frame.pack(fill=BOTH, expand=YES, padx=10, pady=5)

        self.skill_var = tk.StringVar()
        skill_dropdown = ttk.Combobox(frame, textvariable=self.skill_var)
        skill_dropdown['values'] = [skill['name'] for skill in self.skills_data]
        skill_dropdown.pack(side=LEFT, padx=5)

        self.skill_rank_var = tk.StringVar()
        skill_rank_entry = ttk.Entry(frame, textvariable=self.skill_rank_var, width=5)
        skill_rank_entry.pack(side=LEFT, padx=5)

        ttk.Button(frame, text="Add Skill", command=self.add_skill).pack(side=LEFT, padx=5)

        self.skills_listbox = tk.Listbox(parent)
        self.skills_listbox.pack(fill=BOTH, expand=YES, padx=10, pady=5)

    def create_advantages_section(self, parent):
        frame = ttk.Frame(parent)
        frame.pack(fill=BOTH, expand=YES, padx=10, pady=5)

        self.advantage_var = tk.StringVar()
        advantage_dropdown = ttk.Combobox(frame, textvariable=self.advantage_var)
        advantage_dropdown['values'] = [adv['name'] for adv in self.advantages_data]
        advantage_dropdown.pack(side=LEFT, padx=5)

        self.advantage_rank_var = tk.StringVar()
        advantage_rank_entry = ttk.Entry(frame, textvariable=self.advantage_rank_var, width=5)
        advantage_rank_entry.pack(side=LEFT, padx=5)

        ttk.Button(frame, text="Add Advantage", command=self.add_advantage).pack(side=LEFT, padx=5)

        self.advantages_listbox = tk.Listbox(parent)
        self.advantages_listbox.pack(fill=BOTH, expand=YES, padx=10, pady=5)

    def create_powers_section(self, parent):
        frame = ttk.Frame(parent)
        frame.pack(fill=BOTH, expand=YES, padx=10, pady=5)

        # Power selection
        power_frame = ttk.Frame(frame)
        power_frame.pack(fill=X, pady=5)
        ttk.Label(power_frame, text="Power:").pack(side=LEFT)
        self.power_var = tk.StringVar()
        power_dropdown = ttk.Combobox(power_frame, textvariable=self.power_var)
        power_dropdown['values'] = [power['name'] for power in self.powers_data]
        power_dropdown.pack(side=LEFT, padx=5)

        # Power rank
        rank_frame = ttk.Frame(frame)
        rank_frame.pack(fill=X, pady=5)
        ttk.Label(rank_frame, text="Rank:").pack(side=LEFT)
        self.power_rank_var = tk.StringVar()
        power_rank_entry = ttk.Entry(rank_frame, textvariable=self.power_rank_var, width=5)
        power_rank_entry.pack(side=LEFT, padx=5)

        # Extras selection
        extras_frame = ttk.Frame(frame)
        extras_frame.pack(fill=X, pady=5)
        ttk.Label(extras_frame, text="Extra:").pack(side=LEFT)
        self.extra_var = tk.StringVar()
        extra_dropdown = ttk.Combobox(extras_frame, textvariable=self.extra_var)
        extra_dropdown['values'] = [extra['name'] for extra in self.extras_data]
        extra_dropdown.pack(side=LEFT, padx=5)
        ttk.Label(extras_frame, text="Rank:").pack(side=LEFT)
        self.extra_rank_var = tk.StringVar()
        extra_rank_entry = ttk.Entry(extras_frame, textvariable=self.extra_rank_var, width=5)
        extra_rank_entry.pack(side=LEFT, padx=5)
        ttk.Button(extras_frame, text="Add Extra", command=self.add_extra).pack(side=LEFT, padx=5)

        # Flaws selection
        flaws_frame = ttk.Frame(frame)
        flaws_frame.pack(fill=X, pady=5)
        ttk.Label(flaws_frame, text="Flaw:").pack(side=LEFT)
        self.flaw_var = tk.StringVar()
        flaw_dropdown = ttk.Combobox(flaws_frame, textvariable=self.flaw_var)
        flaw_dropdown['values'] = [flaw['name'] for flaw in self.flaws_data]
        flaw_dropdown.pack(side=LEFT, padx=5)
        ttk.Label(flaws_frame, text="Rank:").pack(side=LEFT)
        self.flaw_rank_var = tk.StringVar()
        flaw_rank_entry = ttk.Entry(flaws_frame, textvariable=self.flaw_rank_var, width=5)
        flaw_rank_entry.pack(side=LEFT, padx=5)
        ttk.Button(flaws_frame, text="Add Flaw", command=self.add_flaw).pack(side=LEFT, padx=5)

        # Range selection
        range_frame = ttk.Frame(frame)
        range_frame.pack(fill=X, pady=5)
        ttk.Label(range_frame, text="Range:").pack(side=LEFT)
        self.range_var = tk.StringVar()
        range_dropdown = ttk.Combobox(range_frame, textvariable=self.range_var)
        range_dropdown['values'] = ['Close', 'Ranged']
        range_dropdown.pack(side=LEFT, padx=5)

        # Add Power button
        ttk.Button(frame, text="Add Power", command=self.add_power).pack(pady=10)

        # Listbox to display added powers
        self.powers_listbox = tk.Listbox(frame, height=10)
        self.powers_listbox.pack(fill=BOTH, expand=YES, pady=5)

        # Store extras and flaws for each power
        self.power_extras = {}
        self.power_flaws = {}

    def add_skill(self):
        skill = self.skill_var.get()
        rank = self.skill_rank_var.get()
        if skill and rank:
            self.skills_listbox.insert(tk.END, f"{skill} (Rank: {rank})")
            self.skill_var.set('')
            self.skill_rank_var.set('')

    def add_advantage(self):
        advantage = self.advantage_var.get()
        rank = self.advantage_rank_var.get()
        if advantage and rank:
            self.advantages_listbox.insert(tk.END, f"{advantage} (Rank: {rank})")
            self.advantage_var.set('')
            self.advantage_rank_var.set('')

    def add_extra(self):
        power = self.power_var.get()
        extra = self.extra_var.get()
        rank = self.extra_rank_var.get()
        if power and extra and rank:
            if power not in self.power_extras:
                self.power_extras[power] = []
            self.power_extras[power].append((extra, int(rank)))
            self.extra_var.set('')
            self.extra_rank_var.set('')
            self.update_power_display()

    def add_flaw(self):
        power = self.power_var.get()
        flaw = self.flaw_var.get()
        rank = self.flaw_rank_var.get()
        if power and flaw and rank:
            if power not in self.power_flaws:
                self.power_flaws[power] = []
            self.power_flaws[power].append((flaw, int(rank)))
            self.flaw_var.set('')
            self.flaw_rank_var.set('')
            self.update_power_display()

    def add_power(self):
        power = self.power_var.get()
        rank = self.power_rank_var.get()
        if power and rank:
            extras = self.power_extras.get(power, [])
            flaws = self.power_flaws.get(power, [])
            power_display = f"{power} (Rank: {rank})"
            if extras:
                power_display += f", Extras: {', '.join([f'{e[0]} ({e[1]})' for e in extras])}"
            if flaws:
                power_display += f", Flaws: {', '.join([f'{f[0]} ({f[1]})' for f in flaws])}"
            power_display += f", Range: {self.range_var.get()}"
            self.powers_listbox.insert(tk.END, power_display)
            self.power_var.set('')
            self.power_rank_var.set('')
            self.power_extras.pop(power, None)
            self.power_flaws.pop(power, None)

    def update_power_display(self):
        power = self.power_var.get()
        if power:
            extras = self.power_extras.get(power, [])
            flaws = self.power_flaws.get(power, [])
            power_display = f"{power}"
            if extras:
                power_display += f", Extras: {', '.join([f'{e[0]} ({e[1]})' for e in extras])}"
            if flaws:
                power_display += f", Flaws: {', '.join([f'{f[0]} ({f[1]})' for f in flaws])}"
            messagebox.showinfo("Current Power", power_display)

    def save_character(self):
        character_data = self.get_character_data()
        if character_data["name"]:
            self.characters[character_data["name"]] = character_data
            self.display_character_callback(character_data)
            messagebox.showinfo("Success", f"Character '{character_data['name']}' added to GM Cheat Sheet.")
            self.master.destroy()
        else:
            messagebox.showerror("Error", "Character name is required.")

    def get_character_data(self) -> Dict[str, Any]:
        character_data = {
            "name": self.entries["Name"].get(),
            "initiative": self.entries["Initiative"].get(),
            "theme": self.entries["Theme"].get(),
            "stats": {
                stat: {"value": int(self.entries[stat].get() or 0)}
                for stat in ["Strength", "Agility", "Fighting", "Stamina", "Intellect", "Awareness", "Presence", "Dexterity"]
            },
            "defenses": {
                defense: {"total_rank": int(self.entries[defense].get() or 0)}
                for defense in ["Dodge", "Fortitude", "Parry", "Will", "Toughness"]
            },
            "skills": [{"name": skill.split(" (")[0], "rank": int(skill.split("Rank: ")[1][:-1])} 
                       for skill in self.skills_listbox.get(0, tk.END)],
            "advantages": [{"name": adv.split(" (")[0], "rank": int(adv.split("Rank: ")[1][:-1])} 
                           for adv in self.advantages_listbox.get(0, tk.END)],
            "powers": self.parse_powers(),
        }
        return character_data

    def parse_powers(self):
        powers = []
        for power_str in self.powers_listbox.get(0, tk.END):
            power_parts = power_str.split(", ")
            power_name, power_rank = power_parts[0].split(" (Rank: ")
            power = {
                "name": power_name,
                "rank": int(power_rank[:-1]),
                "extras": [],
                "extras_ranks": [],
                "flaws": [],
                "flaws_ranks": [],
                "range": "Close"  # Default range
            }
            for part in power_parts[1:]:
                if part.startswith("Extras:"):
                    extras = part[8:].split(", ")
                    for extra in extras:
                        extra_name, extra_rank = extra.split(" (")
                        power["extras"].append(extra_name)
                        power["extras_ranks"].append(int(extra_rank[:-1]))
                elif part.startswith("Flaws:"):
                    flaws = part[7:].split(", ")
                    for flaw in flaws:
                        flaw_name, flaw_rank = flaw.split(" (")
                        power["flaws"].append(flaw_name)
                        power["flaws_ranks"].append(int(flaw_rank[:-1]))
                elif part.startswith("Range:"):
                    power["range"] = part[7:]
            powers.append(power)
        return powers

if __name__ == "__main__":
    root = ttk.Window(themename="darkly")
    root.geometry("800x600")  # Set initial window size
    app = GMSheetApp(root, None, {})
    root.mainloop()
