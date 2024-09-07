import tkinter as tk
from tkinter import filedialog, messagebox
import json
from typing import Dict, Any, Callable
import ttkbootstrap as ttk
from ttkbootstrap.constants import *
from ttkbootstrap.scrolled import ScrolledFrame

from initiative_tracker import open_initiative_tracker

class GMSheetApp:
    def __init__(self, master: ttk.Window, main_notebook: ttk.Notebook, characters: Dict[str, Any]):
        self.master = master
        self.master.title("GM Cheat Sheet")
        self.master.geometry("800x600")  # Increased window size
        self.main_notebook = main_notebook
        self.characters = characters
        self.displayed_characters: Dict[str, ttk.Frame] = {}

        self.setup_styles()
        self.setup_ui()

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

    def setup_buttons(self):
        button_frame = ttk.Frame(self.scrolled_frame)
        button_frame.pack(fill=X, expand=YES, pady=10)

        buttons = [
            ("Add New Character", self.add_new_character, "info"),
            ("Upload from Tab", self.upload_character, "info"),
            ("Upload All Tabs", self.upload_all_characters, "info"),
            ("Save Sheet", self.save_sheet, "success"),
            ("Upload Sheet", self.upload_sheet, "success"),
            ("Upload to Init Tracker", self.upload_to_init_tracker, "warning")  # New button
        ]

        for text, command, style in buttons:
            ttk.Button(button_frame, text=text, command=command, style=f"{style}.TButton").pack(side=LEFT, padx=5)

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
        else:
            messagebox.showerror("Error", "No character data found for the current tab")

    def upload_all_characters(self):
        for tab in self.main_notebook.tabs():
            tab_text = self.main_notebook.tab(tab, "text")
            if tab_text in self.characters:
                self.display_character(self.characters[tab_text])
        messagebox.showinfo("Success", "All characters from tabs have been uploaded to the GM Cheat Sheet.")

    def display_character(self, character_data: Dict[str, Any]):
        name = character_data["name"]
        if name in self.displayed_characters:
            self.character_notebook.forget(self.displayed_characters[name])

        char_frame = ttk.Frame(self.character_notebook)
        self.character_notebook.add(char_frame, text=name)

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

        ttk.Button(char_frame, text="Delete", command=lambda: self.confirm_delete(character_data["name"]), 
                   style="danger.TButton").pack(pady=5)

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
            "Powers": [(power['name'], f"Rank: {power['rank']}, Flaws: {power['flaws']}, Extras: {power['extras']}, Range: {power['range']}")
                       for power in character_data.get("powers", [])],
        }

    def confirm_delete(self, name: str):
        if messagebox.askyesno("Confirm Delete", f"Are you sure you want to remove {name} from the GM Cheat Sheet?"):
            self.delete_character(name)

    def delete_character(self, name: str):
        if name in self.displayed_characters:
            self.character_notebook.forget(self.displayed_characters[name])
            del self.displayed_characters[name]
            del self.characters[name]
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
                self.characters = json.load(file)
                self.refresh_display()
            messagebox.showinfo("Upload Sheet", f"Sheet uploaded from {load_path}")

    def upload_to_init_tracker(self):
        init_tracker_data = []
        for character_data in self.characters.values():
            name = character_data.get("name", "")
            awareness = character_data.get("stats", {}).get("Awareness", {}).get("value", 0)
            agility = character_data.get("stats", {}).get("Agility", {}).get("value", 0)
            initiative = character_data.get("initiative", "")
            
            init_tracker_data.append((name, awareness, agility, initiative))
        
        open_initiative_tracker(self.main_notebook, self.characters, init_tracker_data)
        messagebox.showinfo("Success", "All characters have been uploaded to the Initiative Tracker.")

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
