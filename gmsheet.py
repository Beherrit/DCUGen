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
            "Powers": [(power['name'], f"Rank: {power['rank']}, Flaws: {power['flaws']}, Extras: {power['extras']}, Range: {power['range']}")
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
        self.create_form()

    def create_form(self):
        notebook = ttk.Notebook(self)
        notebook.pack(fill=BOTH, expand=YES)

        basic_frame = ttk.Frame(notebook)
        attributes_frame = ttk.Frame(notebook)
        defenses_frame = ttk.Frame(notebook)
        other_frame = ttk.Frame(notebook)

        notebook.add(basic_frame, text="Basic")
        notebook.add(attributes_frame, text="Attributes")
        notebook.add(defenses_frame, text="Defenses")
        notebook.add(other_frame, text="Other")

        basic_fields = ["Name", "Initiative", "Theme"]
        attribute_fields = ["Strength", "Agility", "Fighting", "Stamina", "Intellect", "Awareness", "Presence", "Dexterity"]
        defense_fields = ["Dodge", "Fortitude", "Parry", "Will", "Toughness"]
        other_fields = ["Skills", "Advantages", "Powers"]

        self.entries = {}

        self.create_fields(basic_frame, basic_fields)
        self.create_fields(attributes_frame, attribute_fields)
        self.create_fields(defenses_frame, defense_fields)
        self.create_fields(other_frame, other_fields)

        # Add instruction text for the "Other" tab
        instruction_text = "For Skills and Advantages, use the format:\nname1:rank1, name2:rank2, ...\nExample: Acrobatics:5, Deception:3\n\nFor Powers, use the format:\nname:rank:flaws:extras:range, ...\nExample: Flight:5:None:None:Ranged, Blast:7:Unreliable:Penetrating:Close"
        ttk.Label(other_frame, text=instruction_text, wraplength=350, justify="left").pack(pady=10)

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
        return {
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
            "skills": [{"name": skill.split(":")[0].strip(), "rank": int(skill.split(":")[1].strip())} 
                       for skill in self.entries["Skills"].get().split(",") if ":" in skill],
            "advantages": [{"name": adv.split(":")[0].strip(), "rank": int(adv.split(":")[1].strip())} 
                           for adv in self.entries["Advantages"].get().split(",") if ":" in adv],
            "powers": [{"name": power.split(":")[0].strip(), 
                        "rank": int(power.split(":")[1].strip()),
                        "flaws": power.split(":")[2].strip(),
                        "extras": power.split(":")[3].strip(),
                        "range": power.split(":")[4].strip()} 
                       for power in self.entries["Powers"].get().split(",") if len(power.split(":")) == 5],
        }

if __name__ == "__main__":
    root = ttk.Window(themename="darkly")
    root.geometry("800x600")  # Set initial window size
    app = GMSheetApp(root, None, {})
    root.mainloop()
