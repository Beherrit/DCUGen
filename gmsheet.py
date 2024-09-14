import tkinter as tk
from tkinter import filedialog
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
        self.loaded_characters = characters  # Characters loaded from DCUAQA.py
        self.displayed_characters: Dict[str, ttk.Frame] = {}  # Characters displayed in GM Sheet
        self.gm_sheet_characters: Dict[str, Any] = {}  # Characters saved in GM Sheet

        self.auto_save_file = "gm_sheet_autosave.json"
        self.init_tracker_window = None

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
            ("Import Excel Character", self.import_character, "info", "Import a character from an Excel file"),
            ("Upload Image To Tab", self.upload_image, "info", "Upload an image for the selected character"),
            ("Tab Upload", self.upload_character, "info", "Upload the character from the current tab"),
            ("Upload All Tabs", self.upload_all_characters, "info", "Upload all characters from all tabs"),
            ("JSON Save File", self.save_sheet, "success", "Save all characters to a JSON file"),
            ("JSON Import File", self.upload_sheet, "success", "Load characters from a saved JSON file"),
            ("Upload to Init Tracker", self.upload_to_init_tracker, "warning", "Send characters to the Initiative Tracker"),
            ("Clear GM Screen", self.clear_gm_screen, "danger", "Remove all characters from the GM Screen")
        ]

        for i, (text, command, style, tooltip_text) in enumerate(buttons):
            row = i // 3
            col = i % 3
            button = ttk.Button(button_frame, text=text, command=command, style=f"{style}.TButton", width=15)
            button.grid(row=row, column=col, padx=5, pady=5, sticky="nsew")
            ToolTip(button, tooltip_text)

        for i in range(3):
            button_frame.columnconfigure(i, weight=1)

    def add_new_character(self):
        new_window = ttk.Toplevel(self.master)
        new_window.title("Add New Character")
        new_window.geometry("400x600")
        CharacterForm(new_window, self.gm_sheet_characters, self.display_character, self).pack(fill=BOTH, expand=YES, padx=20, pady=20)

    def load_autosave(self):
        if os.path.exists(self.auto_save_file):
            with open(self.auto_save_file, 'r') as file:
                self.gm_sheet_characters = json.load(file)
                self.refresh_display()

    def upload_character(self):
        current_tab = self.main_notebook.select()
        tab_text = self.main_notebook.tab(current_tab, "text")
        if tab_text in self.loaded_characters:
            character_data = self.loaded_characters[tab_text]
            self.gm_sheet_characters[tab_text] = character_data
            self.display_character(character_data)
            self.auto_save()

    def upload_all_characters(self):
        for tab in self.main_notebook.tabs():
            tab_text = self.main_notebook.tab(tab, "text")
            if tab_text in self.loaded_characters:
                character_data = self.loaded_characters[tab_text]
                self.gm_sheet_characters[tab_text] = character_data
                self.display_character(character_data)
        self.auto_save()

    def display_character(self, character_data: Dict[str, Any]):
        name = character_data["name"]
        if name in self.displayed_characters:
            self.character_notebook.forget(self.displayed_characters[name])

        char_frame = ttk.Frame(self.character_notebook)
        self.character_notebook.add(char_frame, text=name)

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
            "Powers": self.format_powers(character_data.get("powers", [])),
        }

    def format_powers(self, powers):
        formatted_powers = []
        for power in powers:
            if 'description' in power:
                # This is an imported power
                formatted_powers.append((power['name'], power['description']))
            else:
                # This is a manually added power
                power_description = f"Rank: {power.get('rank', '')}, "
                power_description += f"Flaws: {', '.join(f'{flaw} ({rank})' for flaw, rank in zip(power.get('flaws', []), power.get('flaws_ranks', [])))}, "
                power_description += f"Extras: {', '.join(f'{extra} ({rank})' for extra, rank in zip(power.get('extras', []), power.get('extras_ranks', [])))}, "
                power_description += f"Range: {power.get('range', 'Close')}"
                formatted_powers.append((power['name'], power_description))
        return formatted_powers

    def delete_character(self, name):
        if name in self.displayed_characters:
            self.displayed_characters[name].destroy()
            del self.displayed_characters[name]
        if name in self.gm_sheet_characters:
            del self.gm_sheet_characters[name]
        self.auto_save()
        self.refresh_display()
        self.scrolled_frame.yview_moveto(0)

    def refresh_display(self):
        for tab in self.character_notebook.tabs():
            self.character_notebook.forget(tab)
        self.displayed_characters.clear()
        for data in self.gm_sheet_characters.values():
            self.display_character(data)

    def save_sheet(self):
        save_path = filedialog.asksaveasfilename(defaultextension=".json", filetypes=[("JSON files", "*.json")])
        if save_path:
            with open(save_path, 'w') as file:
                json.dump(self.gm_sheet_characters, file)

    def upload_sheet(self):
        load_path = filedialog.askopenfilename(filetypes=[("JSON files", "*.json")])
        if load_path:
            with open(load_path, 'r') as file:
                loaded_characters = json.load(file)
                self.gm_sheet_characters.update(loaded_characters)
                self.refresh_display()
            self.auto_save()

    def upload_to_init_tracker(self):
        init_tracker_data = []
        for character_data in self.gm_sheet_characters.values():
            name = character_data.get("name", "")
            awareness = character_data.get("stats", {}).get("Awareness", {}).get("value", 0)
            agility = character_data.get("stats", {}).get("Agility", {}).get("value", 0)
            initiative = character_data.get("initiative", 0)
            
            if isinstance(initiative, dict):
                initiative = initiative.get("total", 0)
            initiative = int(initiative) if isinstance(initiative, (int, str)) and str(initiative).isdigit() else 0
            
            init_tracker_entry = (
                name, awareness, agility, initiative, "", initiative,
                "False", "Normal", "Normal", "Normal", "", "", "", "", "", ""
            )
            
            init_tracker_data.append(init_tracker_entry)
        
        if self.init_tracker_window is None or not self.init_tracker_window.winfo_exists():
            self.init_tracker_window = open_initiative_tracker(self.main_notebook, self.gm_sheet_characters, init_tracker_data)
        else:
            update_initiative_tracker(self.init_tracker_window, init_tracker_data)

    def auto_save(self):
        with open(self.auto_save_file, 'w') as file:
            json.dump(self.gm_sheet_characters, file)

    def import_character(self):
        file_path = filedialog.askopenfilename(filetypes=[("Excel files", "*.xlsx")])
        if file_path:
            try:
                wb = load_workbook(filename=file_path, data_only=True)
                sheet = wb.active
                
                character_data = {
                    "name": sheet['K2'].value or "Unknown",
                    "gender": sheet['AP2'].value or "",
                    "age": sheet['BD2'].value or "",
                    "power_level": sheet['W33'].value or 0,
                    "theme": sheet['AD26'].value or "",
                    "languages": sheet['R38'].value.split(", ") if sheet['R38'].value else [],
                    "origin": {
                        "region": "",
                        "country": "",
                        "language": ""
                    },
                    "physical_traits": {
                        "height": sheet['BE5'].value or "",
                        "weight": sheet['BE8'].value or "",
                        "eye_color": sheet['AP5'].value or "",
                        "hair_color": sheet['AP8'].value or ""
                    },
                    "stats": {
                        "Strength": {"value": sheet['N18'].value or 0},
                        "Agility": {"value": sheet['N26'].value or 0},
                        "Fighting": {"value": sheet['N34'].value or 0},
                        "Awareness": {"value": sheet['N42'].value or 0},
                        "Stamina": {"value": sheet['N22'].value or 0},
                        "Dexterity": {"value": sheet['N30'].value or 0},
                        "Intellect": {"value": sheet['N38'].value or 0},
                        "Presence": {"value": sheet['N46'].value or 0}
                    },
                    "defenses": {
                        "Dodge": {"total_rank": sheet['Z18'].value or 0},
                        "Parry": {"total_rank": sheet['Z24'].value or 0},
                        "Fortitude": {"total_rank": sheet['Z21'].value or 0},
                        "Toughness": {"total_rank": sheet['Z30'].value or 0},
                        "Will": {"total_rank": sheet['Z27'].value or 0}
                    },
                    "initiative": sheet['AK18'].value or 0,
                    "total_cost": int(sheet['AD33'].value or 0),
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

                if sheet['G93'].value:
                    origin_parts = sheet['G93'].value.split(" | ")
                    character_data["origin"]["region"] = origin_parts[0] if len(origin_parts) > 0 else ""
                    character_data["origin"]["country"] = origin_parts[1] if len(origin_parts) > 1 else ""
                    character_data["origin"]["language"] = origin_parts[2] if len(origin_parts) > 2 else ""

                all_traits = sheet['AK90'].value
                if all_traits:
                    traits = all_traits.split("|")
                    character_data["personality_traits"]["positive_traits"] = traits[0].strip().split(", ") if len(traits) > 0 else []
                    character_data["personality_traits"]["negative_traits"] = traits[1].strip().split(", ") if len(traits) > 1 else []
                    character_data["personality_traits"]["quirky_traits"] = traits[2].strip().split(", ") if len(traits) > 2 else []

                character_data["powers"] = []
                for row in range(54, 84, 3):  # Adjust this range if needed
                    power_cell = f'B{row}'
                    if sheet[power_cell].value:
                        power = {
                            "name": f"Power {(row-54)//3 + 1}",
                            "description": str(sheet[power_cell].value).strip()
                        }
                        character_data["powers"].append(power)

                for row in range(104, 142, 2):
                    name_cell = f'X{row}'
                    rank_cell = f'AE{row}'
                    if sheet[name_cell].value:
                        advantage = {
                            "name": sheet[name_cell].value,
                            "rank": sheet[rank_cell].value or 0
                        }
                        character_data["advantages"].append(advantage)

                skill_cells = {
                    "Acrobatics": "S104", "Athletics": "S106", "Close Combat": "S110",
                    "Deception": "S118", "Expertise": "S120", "Insight": "S130",
                    "Intimidation": "S132", "Investigation": "S134", "Perception": "S136",
                    "Persuasion": "S138", "Ranged Combat": "S140", "Stealth": "S150",
                    "Technology": "S152", "Treatment": "S154", "Vehicles": "S156",
                    "Sleight of Hand": "S148"
                }
                character_data["skills"] = []
                for skill_name, cell in skill_cells.items():
                    cell_value = sheet[cell].value
                    if cell_value is not None:
                        skill = {
                            "name": skill_name,
                            "rank": int(cell_value) if isinstance(cell_value, (int, float)) else 0
                        }
                        character_data["skills"].append(skill)

                motivation = sheet['F88'].value
                if motivation:
                    parts = motivation.split(":")
                    character_data["Motivation"]["name"] = parts[0].strip()
                    character_data["Motivation"]["description"] = ":".join(parts[1:]).strip() if len(parts) > 1 else ""

                for cell in ['F90', 'AK88']:
                    complication = sheet[cell].value
                    if complication:
                        parts = complication.split(":")
                        character_data["Complications"].append({
                            "name": parts[0].strip(),
                            "description": ":".join(parts[1:]).strip() if len(parts) > 1 else ""
                        })

                self.gm_sheet_characters[character_data["name"]] = character_data
                self.display_character(character_data)
                self.auto_save()
            
            except Exception as e:
                print(f"An error occurred while importing the character: {str(e)}")

    def display_character_image(self, frame, image_path):
        if image_path and os.path.exists(image_path):
            img = Image.open(image_path)
            img = img.resize((100, 100), Image.LANCZOS)
            photo = ImageTk.PhotoImage(img)
            img_label = ttk.Label(frame, image=photo, cursor="hand2")
            img_label.image = photo
            img_label.pack(side=LEFT, pady=5)
            img_label.bind("<Button-1>", lambda e: self.open_large_image(image_path))
        else:
            ttk.Label(frame, text="No image", style="Body.TLabel").pack(side=LEFT, pady=5)

    def upload_image(self):
        current_tab = self.character_notebook.select()
        if not current_tab:
            return

        character_name = self.character_notebook.tab(current_tab, "text")
        if character_name not in self.gm_sheet_characters:
            return

        file_path = filedialog.askopenfilename(filetypes=[("Image files", "*.png;*.jpg;*.jpeg;*.gif")])
        if file_path:
            self.gm_sheet_characters[character_name]["image_path"] = file_path
            self.refresh_display()
            self.auto_save()

    def open_large_image(self, image_path):
        if image_path and os.path.exists(image_path):
            img = Image.open(image_path)
            max_size = (800, 600)
            img.thumbnail(max_size, Image.LANCZOS)
            
            top = ttk.Toplevel(self.master)
            top.title("Character Image")
            
            photo = ImageTk.PhotoImage(img)
            label = ttk.Label(top, image=photo)
            label.image = photo
            label.pack(padx=10, pady=10)

    def show_context_menu(self, event):
        try:
            tab = self.character_notebook.identify(event.x, event.y)
            if tab:
                index = self.character_notebook.index(f"@{event.x},{event.y}")
                character_name = self.character_notebook.tab(index, "text")
                menu = ttk.Menu(self.master, tearoff=0)
                menu.add_command(label=f"Delete {character_name}", 
                                command=lambda: self.delete_character(character_name))
                menu.tk_popup(event.x_root, event.y_root)
        except Exception as e:
            print(f"Error in show_context_menu: {e}")

    def clear_gm_screen(self):
        self.gm_sheet_characters.clear()
        self.displayed_characters.clear()
        for tab in self.character_notebook.tabs():
            self.character_notebook.forget(tab)
        self.auto_save()

class CharacterForm(ttk.Frame):
    def __init__(self, master: ttk.Toplevel, characters: Dict[str, Any], display_character_callback: Callable, app: GMSheetApp):
        super().__init__(master)
        self.characters = characters
        self.display_character_callback = display_character_callback
        self.app = app
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
                setattr(self, f'{attr}_data', [])
            except json.JSONDecodeError:
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

    def save_character(self):
        character_data = self.get_character_data()
        if character_data["name"]:
            self.characters[character_data["name"]] = character_data
            self.display_character_callback(character_data)
            self.app.auto_save()  # Add this line to trigger auto-save
            self.master.destroy()

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
