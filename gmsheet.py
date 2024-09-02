import tkinter as tk
from tkinter import filedialog, messagebox
import json
from typing import Dict, Any, Callable
import ttkbootstrap as ttk
from ttkbootstrap.constants import *
from ttkbootstrap.scrolled import ScrolledFrame

class GMSheetApp:
    def __init__(self, master: ttk.Window, main_notebook: ttk.Notebook, characters: Dict[str, Any]):
        self.master = master
        self.master.title("GM Cheat Sheet")
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
        self.character_frame = ttk.Frame(self.scrolled_frame)
        self.character_frame.pack(fill=BOTH, expand=YES)

    def setup_buttons(self):
        button_frame = ttk.Frame(self.scrolled_frame)
        button_frame.pack(fill=X, expand=YES, pady=10)

        buttons = [
            ("Add New Character", self.add_new_character, "info"),
            ("Upload Character", self.upload_character, "info"),
            ("Save Sheet", self.save_sheet, "success"),
            ("Upload Sheet", self.upload_sheet, "success")
        ]

        for text, command, style in buttons:
            ttk.Button(button_frame, text=text, command=command, style=f"{style}.TButton").pack(side=LEFT, padx=5)

    def add_new_character(self):
        new_window = ttk.Toplevel(self.master)
        new_window.title("Add New Character")
        CharacterForm(new_window, self.characters, self.display_character).pack(fill=BOTH, expand=YES, padx=20, pady=20)

    def upload_character(self):
        current_tab = self.main_notebook.select()
        tab_text = self.main_notebook.tab(current_tab, "text")
        if tab_text in self.characters:
            self.display_character(self.characters[tab_text])
        else:
            messagebox.showerror("Error", "No character data found for the current tab")

    def display_character(self, character_data: Dict[str, Any]):
        char_frame = ttk.Frame(self.character_frame)
        char_frame.pack(side=LEFT, fill=Y, padx=10, pady=10)

        ttk.Button(char_frame, text="Delete", command=lambda: self.confirm_delete(character_data["name"]), 
                   style="danger.TButton").pack(pady=5)

        sections = self.get_character_sections(character_data)

        for section, items in sections.items():
            section_frame = CollapsibleSection(char_frame, section, start_collapsed=False)
            for name, value in items:
                ttk.Label(section_frame.body_frame, text=f"{name}: {value}", style="Body.TLabel").pack(fill=X, padx=5, pady=2)
            section_frame.pack(fill=X, pady=5)

        self.displayed_characters[character_data["name"]] = char_frame

    def get_character_sections(self, character_data: Dict[str, Any]) -> Dict[str, list]:
        return {
            "NAME": [("Name", character_data.get("name", ""))],
            "THEME": [("Theme", character_data.get("theme", ""))],
            "ATTRIBUTES": [
                (attr, character_data.get("stats", {}).get(attr, {}).get("value", ""))
                for attr in ["Initiative", "Strength", "Agility", "Fighting", "Stamina", "Intellect", "Awareness", "Presence", "Dexterity"]
            ],
            "DEFENSES": [
                (defense, character_data.get("defenses", {}).get(defense, {}).get("total_rank", ""))
                for defense in ["Dodge", "Fortitude", "Parry", "Will", "Toughness"]
            ],
            "Skills": [(skill["name"], skill["rank"]) for skill in character_data.get("skills", [])],
            "Advantages": [(advantage["name"], advantage["rank"]) for advantage in character_data.get("advantages", [])],
            "Powers": [(power["name"], power["rank"]) for power in character_data.get("powers", [])],
        }

    def confirm_delete(self, name: str):
        if messagebox.askyesno("Confirm Delete", f"Are you sure you want to remove {name} from the GM Cheat Sheet?"):
            self.delete_character(name)

    def delete_character(self, name: str):
        if name in self.displayed_characters:
            self.displayed_characters[name].destroy()
            del self.displayed_characters[name]
            messagebox.showinfo("Success", f"Character '{name}' removed from GM Cheat Sheet.")

    def refresh_display(self):
        for widget in self.character_frame.winfo_children():
            widget.destroy()
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

class CharacterForm(ttk.Frame):
    def __init__(self, master: ttk.Toplevel, characters: Dict[str, Any], display_character_callback: Callable):
        super().__init__(master)
        self.characters = characters
        self.display_character_callback = display_character_callback
        self.create_form()

    def create_form(self):
        fields = [
            "Name", "Initiative", "Theme", "Strength", "Agility", "Fighting", "Stamina",
            "Intellect", "Awareness", "Presence", "Dexterity",
            "Dodge", "Fortitude", "Parry", "Will", "Toughness",
            "Skills", "Advantages", "Powers"
        ]

        self.entries = {field: ttk.Entry(self) for field in fields}

        for field, entry in self.entries.items():
            ttk.Label(self, text=field, style="Body.TLabel").pack(pady=(10, 0))
            entry.pack(fill=X, padx=10)

        ttk.Button(self, text="Save to GM Cheat Sheet", command=self.save_character, 
                   style="success.TButton").pack(pady=20)

    def save_character(self):
        character_data = self.get_character_data()
        if character_data["name"]:
            self.characters[character_data["name"]] = character_data
            self.display_character_callback(character_data)
            messagebox.showinfo("Success", f"Character '{character_data['name']}' added to GM Cheat Sheet.")
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
            "powers": [{"name": power.split(":")[0].strip(), "rank": int(power.split(":")[1].strip())} 
                       for power in self.entries["Powers"].get().split(",") if ":" in power],
        }

class CollapsibleSection(ttk.Frame):
    def __init__(self, master: ttk.Frame, title: str, start_collapsed: bool = True):
        super().__init__(master)
        self.title = title
        self.is_collapsed = start_collapsed

        self.header = ttk.Button(self, text=title, style="secondary.TButton", command=self.toggle)
        self.header.pack(fill=X)

        self.body_frame = ttk.Frame(self)
        if not self.is_collapsed:
            self.body_frame.pack(fill=X, expand=YES)

    def toggle(self):
        if self.is_collapsed:
            self.body_frame.pack(fill=X, expand=YES)
        else:
            self.body_frame.pack_forget()
        self.is_collapsed = not self.is_collapsed

if __name__ == "__main__":
    root = ttk.Window(themename="darkly")
    app = GMSheetApp(root, None, {})
    root.mainloop()
