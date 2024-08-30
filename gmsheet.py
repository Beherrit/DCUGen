import tkinter as tk
from tkinter import filedialog, messagebox
import json
import ttkbootstrap as ttk
from ttkbootstrap.constants import *
from ttkbootstrap.scrolled import ScrolledFrame

class GMSheetApp:
    def __init__(self, master, main_notebook, characters):
        self.master = master
        self.master.title("GM Cheat Sheet")
        self.main_notebook = main_notebook
        self.characters = characters  # This should be a dictionary
        self.displayed_characters = {}  # New dictionary to track displayed characters

        self.style = ttk.Style()
        self.style.configure("TLabel", font=("Helvetica", 10))
        self.style.configure("TButton", font=("Helvetica", 10))
        self.style.configure("Header.TLabel", font=("Helvetica", 12, "bold"))
        self.style.configure("Body.TLabel", font=("Helvetica", 10))

        # Create a canvas with scrollbar
        self.canvas = tk.Canvas(self.master)
        self.scrollbar = ttk.Scrollbar(self.master, orient="vertical", command=self.canvas.yview)
        self.scrollable_frame = ttk.Frame(self.canvas)

        self.scrollable_frame.bind(
            "<Configure>",
            lambda e: self.canvas.configure(
                scrollregion=self.canvas.bbox("all")
            )
        )

        self.canvas.create_window((0, 0), window=self.scrollable_frame, anchor="nw")
        self.canvas.configure(yscrollcommand=self.scrollbar.set)

        # Pack the canvas and scrollbar
        self.canvas.pack(side="left", fill="both", expand=True)
        self.scrollbar.pack(side="right", fill="y")

        self.setup_widgets()

        # Bind mousewheel to scrolling
        self.canvas.bind_all("<MouseWheel>", self._on_mousewheel)

    def _on_mousewheel(self, event):
        self.canvas.yview_scroll(int(-1*(event.delta/120)), "units")

    def setup_widgets(self):
        self.button_frame = ttk.Frame(self.scrollable_frame)
        self.button_frame.pack(fill=X, expand=YES, pady=10)

        self.add_character_button = ttk.Button(self.button_frame, text="Add New Character", command=self.add_new_character, style="info.TButton")
        self.add_character_button.pack(side=LEFT, padx=5)

        self.upload_character_button = ttk.Button(self.button_frame, text="Upload Character", command=self.upload_character, style="info.TButton")
        self.upload_character_button.pack(side=LEFT, padx=5)

        self.save_sheet_button = ttk.Button(self.button_frame, text="Save Sheet", command=self.save_sheet, style="success.TButton")
        self.save_sheet_button.pack(side=LEFT, padx=5)

        self.upload_sheet_button = ttk.Button(self.button_frame, text="Upload Sheet", command=self.upload_sheet, style="success.TButton")
        self.upload_sheet_button.pack(side=LEFT, padx=5)

        self.character_frame = ttk.Frame(self.scrollable_frame)
        self.character_frame.pack(fill=BOTH, expand=YES)

    def add_new_character(self):
        new_window = ttk.Toplevel(self.master)
        new_window.title("Add New Character")
        new_character = CharacterForm(new_window, self.characters, self.display_character)
        new_character.pack(fill=BOTH, expand=YES, padx=20, pady=20)

    def upload_character(self):
        current_tab = self.main_notebook.select()
        tab_text = self.main_notebook.tab(current_tab, "text")
        if tab_text in self.characters:
            character_data = self.characters[tab_text]
            self.display_character(character_data)
        else:
            messagebox.showerror("Error", "No character data found for the current tab")

    def display_character(self, character_data):
        char_frame = ttk.Frame(self.character_frame)
        char_frame.pack(side=LEFT, fill=Y, padx=10, pady=10)

        delete_button = ttk.Button(char_frame, text="Delete", command=lambda: self.confirm_delete(character_data["name"]), style="danger.TButton")
        delete_button.pack(pady=5)

        sections = {
            "NAME": [("Name", character_data.get("name", ""))],
            "THEME": [("Theme", character_data.get("theme", ""))],
            "ATTRIBUTES": [
                ("Initiative", character_data.get("initiative", "")),
                ("Strength", character_data.get("stats", {}).get("Strength", {}).get("value", "")),
                ("Agility", character_data.get("stats", {}).get("Agility", {}).get("value", "")),
                ("Fighting", character_data.get("stats", {}).get("Fighting", {}).get("value", "")),
                ("Stamina", character_data.get("stats", {}).get("Stamina", {}).get("value", "")),
                ("Intellect", character_data.get("stats", {}).get("Intellect", {}).get("value", "")),
                ("Awareness", character_data.get("stats", {}).get("Awareness", {}).get("value", "")),
                ("Presence", character_data.get("stats", {}).get("Presence", {}).get("value", "")),
                ("Dexterity", character_data.get("stats", {}).get("Dexterity", {}).get("value", ""))
            ],
            "DEFENSES": [
                ("Dodge", character_data.get("defenses", {}).get("Dodge", {}).get("total_rank", "")),
                ("Fortitude", character_data.get("defenses", {}).get("Fortitude", {}).get("total_rank", "")),
                ("Parry", character_data.get("defenses", {}).get("Parry", {}).get("total_rank", "")),
                ("Will", character_data.get("defenses", {}).get("Will", {}).get("total_rank", "")),
                ("Toughness", character_data.get("defenses", {}).get("Toughness", {}).get("total_rank", ""))
            ],
            "Skills": [(skill["name"], skill["rank"]) for skill in character_data.get("skills", [])],
            "Advantages": [(advantage["name"], advantage["rank"]) for advantage in character_data.get("advantages", [])],
            "Powers": [(power["name"], power["rank"]) for power in character_data.get("powers", [])],
        }

        for section, items in sections.items():
            section_frame = CollapsibleSection(char_frame, section, start_collapsed=False)
            for name, value in items:
                label = ttk.Label(section_frame.body_frame, text=f"{name}: {value}", style="Body.TLabel")
                section_frame.add_widget(label)
            section_frame.pack(fill=X, pady=5)

        # Add the character to displayed_characters
        self.displayed_characters[character_data["name"]] = char_frame

    def confirm_delete(self, name):
        response = messagebox.askyesno("Confirm Delete", "Are you sure you want to remove this character from the GM Cheat Sheet?")
        if response:
            self.delete_character(name)

    def delete_character(self, name):
        if name in self.displayed_characters:
            self.displayed_characters[name].destroy()  # Remove the character's frame
            del self.displayed_characters[name]  # Remove from displayed_characters dictionary
            messagebox.showinfo("Success", f"Character '{name}' removed from GM Cheat Sheet.")

    def refresh_display(self):
        for widget in self.character_frame.winfo_children():
            widget.destroy()  # Clear all widgets
        self.displayed_characters.clear()  # Clear the displayed_characters dictionary
        for name, data in self.characters.items():
            self.display_character(data)  # Redisplay characters

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
                self.refresh_display()  # Refresh display after uploading new data
            messagebox.showinfo("Upload Sheet", f"Sheet uploaded from {load_path}")

class CharacterForm(ttk.Frame):
    def __init__(self, master, characters, display_character_callback):
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

        self.entries = {}
        for field in fields:
            label = ttk.Label(self, text=field, style="Body.TLabel")
            label.pack(pady=(10, 0))
            entry = ttk.Entry(self)
            entry.pack(fill=X, padx=10)
            self.entries[field] = entry

        save_button = ttk.Button(self, text="Save to GM Cheat Sheet", command=self.save_character, style="success.TButton")
        save_button.pack(pady=20)

    def save_character(self):
        character_data = {
            "name": self.entries["Name"].get(),
            "initiative": self.entries["Initiative"].get(),
            "theme": self.entries["Theme"].get(),
            "stats": {
                "Strength": {"value": int(self.entries["Strength"].get() or 0)},
                "Agility": {"value": int(self.entries["Agility"].get() or 0)},
                "Fighting": {"value": int(self.entries["Fighting"].get() or 0)},
                "Stamina": {"value": int(self.entries["Stamina"].get() or 0)},
                "Intellect": {"value": int(self.entries["Intellect"].get() or 0)},
                "Awareness": {"value": int(self.entries["Awareness"].get() or 0)},
                "Presence": {"value": int(self.entries["Presence"].get() or 0)},
                "Dexterity": {"value": int(self.entries["Dexterity"].get() or 0)},
            },
            "defenses": {
                "Dodge": {"total_rank": int(self.entries["Dodge"].get() or 0)},
                "Fortitude": {"total_rank": int(self.entries["Fortitude"].get() or 0)},
                "Parry": {"total_rank": int(self.entries["Parry"].get() or 0)},
                "Will": {"total_rank": int(self.entries["Will"].get() or 0)},
                "Toughness": {"total_rank": int(self.entries["Toughness"].get() or 0)},
            },
            "skills": [{"name": skill.split(":")[0].strip(), "rank": int(skill.split(":")[1].strip())} for skill in self.entries["Skills"].get().split(",") if ":" in skill],
            "advantages": [{"name": adv.split(":")[0].strip(), "rank": int(adv.split(":")[1].strip())} for adv in self.entries["Advantages"].get().split(",") if ":" in adv],
            "powers": [{"name": power.split(":")[0].strip(), "rank": int(power.split(":")[1].strip())} for power in self.entries["Powers"].get().split(",") if ":" in power],
        }

        character_name = character_data["name"]
        if character_name:
            self.characters[character_name] = character_data
            self.display_character_callback(character_data)
            messagebox.showinfo("Success", f"Character '{character_name}' added to GM Cheat Sheet.")
        else:
            messagebox.showerror("Error", "Character name is required.")

class CollapsibleSection(ttk.Frame):
    def __init__(self, master, title, start_collapsed=True):
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

    def add_widget(self, widget):
        widget.pack(fill=X, padx=5, pady=2)

if __name__ == "__main__":
    root = ttk.Window(themename="darkly")
    app = GMSheetApp(root, None, {})
    root.mainloop()
