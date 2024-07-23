import tkinter as tk
from tkinter import ttk, filedialog, simpledialog, messagebox
import pandas as pd
import json
import os
from utils import calculate_accuracy

gm_cheat_sheet_app = None  # Global variable for GM Cheat Sheet app

class Tooltip:
    def __init__(self, widget):
        self.widget = widget
        self.tooltip_window = None

    def show(self, text, x, y):
        self.hide()  # Hide any existing tooltip before showing a new one
        if not text:
            return
        x = x + self.widget.winfo_rootx() + 25
        y = y + self.widget.winfo_rooty() + 25
        self.tooltip_window = tw = tk.Toplevel(self.widget)
        tw.wm_overrideredirect(True)
        tw.wm_geometry(f"+{x}+{y}")
        label = tk.Label(tw, text=text, background="yellow", relief="solid", borderwidth=1, font=("tahoma", "8", "normal"))
        label.pack()

    def hide(self):
        if self.tooltip_window:
            self.tooltip_window.destroy()
        self.tooltip_window = None

class GMcheatSheetApp:
    def __init__(self, master):
        self.master = master
        self.master.title("GM Cheat Sheet")
        self.master.geometry("1600x1000")

        self.frame = tk.Frame(self.master)
        self.frame.pack(fill="both", expand=True)

        self.button_frame = tk.Frame(self.frame)
        self.button_frame.pack(fill="x", pady=10)

        self.add_button = ttk.Button(self.button_frame, text="Add New Character", command=self.add_character)
        self.add_button.pack(side="left", padx=5)

        self.upload_button = ttk.Button(self.button_frame, text="Upload Character", command=self.upload_character)
        self.upload_button.pack(side="left", padx=5)

        self.save_button = ttk.Button(self.button_frame, text="Save", command=self.save_data)
        self.save_button.pack(side="left", padx=5)

        self.load_button = ttk.Button(self.button_frame, text="Load", command=lambda: self.load_data("gmcheatsheet_data.json"))
        self.load_button.pack(side="left", padx=5)

        self.load_manual_button = ttk.Button(self.button_frame, text="Load Manual File", command=self.load_manual_file)
        self.load_manual_button.pack(side="left", padx=5)

        self.tree_frame = tk.Frame(self.frame)
        self.tree_frame.pack(fill="both", expand=True, padx=20, pady=10)

        self.tree_scroll_y = tk.Scrollbar(self.tree_frame, orient="vertical")
        self.tree_scroll_y.pack(side="right", fill="y")

        self.tree_scroll_x = tk.Scrollbar(self.tree_frame, orient="horizontal")
        self.tree_scroll_x.pack(side="bottom", fill="x")

        self.columns = ["CHARACTER NAME", "Strength", "Stamina", "Agility", "Dexterity", "Fighting",
                        "Intellect", "Awareness", "Presence", "Dodge", "Fortitude", "Parry",
                        "Willpower", "Toughness", "Initiative", "Motivation", "Complication One",
                        "Complication Two", "Summary"]

        self.tree = ttk.Treeview(self.tree_frame, columns=self.columns, show="headings", yscrollcommand=self.tree_scroll_y.set, xscrollcommand=self.tree_scroll_x.set)

        for col in self.columns:
            if col in ["Strength", "Stamina", "Agility", "Dexterity", "Fighting", "Intellect", "Awareness", "Presence", "Dodge", "Fortitude", "Parry", "Willpower", "Toughness", "Initiative"]:
                self.tree.heading(col, text=col)
                self.tree.column(col, width=50, stretch=False)
            else:
                self.tree.heading(col, text=col)
                self.tree.column(col, width=150, stretch=True)

        # Make Willpower column smaller
        self.tree.column("Willpower", width=50, stretch=False)

        self.tree.pack(side="top", fill="both", expand=True)
        self.tree_scroll_y.config(command=self.tree.yview)
        self.tree_scroll_x.config(command=self.tree.xview)

        self.tree.bind("<Double-1>", self.on_double_click)
        self.tree.bind("<Motion>", self.on_hover)
        self.tree.bind("<Button-3>", self.show_context_menu)  # Bind right-click to show context menu

        self.tooltip = Tooltip(self.tree)

        # Create a context menu
        self.context_menu = tk.Menu(self.tree, tearoff=0)
        self.context_menu.add_command(label="Delete Character", command=self.delete_character)

        # Create secondary tree for powers, skills, and advantages
        self.secondary_frame = tk.Frame(self.master)
        self.secondary_frame.pack(fill="both", expand=True, padx=20, pady=10)

        self.tree_secondary_scroll_y = tk.Scrollbar(self.secondary_frame, orient="vertical")
        self.tree_secondary_scroll_y.pack(side="right", fill="y")

        self.tree_secondary_scroll_x = tk.Scrollbar(self.secondary_frame, orient="horizontal")
        self.tree_secondary_scroll_x.pack(side="bottom", fill="x")

        self.secondary_columns = ["CHARACTER NAME"] + [f"Power {i+1}" for i in range(10)] + ["Skills", "Advantages"]
        self.tree_secondary = ttk.Treeview(self.secondary_frame, columns=self.secondary_columns, show="headings", yscrollcommand=self.tree_secondary_scroll_y.set, xscrollcommand=self.tree_secondary_scroll_x.set)

        for col in self.secondary_columns:
            self.tree_secondary.heading(col, text=col)
            self.tree_secondary.column(col, width=120, stretch=False)

        self.tree_secondary.pack(side="top", fill="both", expand=True)
        self.tree_secondary_scroll_y.config(command=self.tree_secondary.yview)
        self.tree_secondary_scroll_x.config(command=self.tree_secondary.xview)

        self.tree_secondary.bind("<Double-1>", self.on_double_click_secondary)
        self.tree_secondary.bind("<Motion>", self.on_hover_secondary)
        self.tree_secondary.bind("<Button-3>", self.show_context_menu_secondary)

        self.tooltip_secondary = Tooltip(self.tree_secondary)

        self.context_menu_secondary = tk.Menu(self.tree_secondary, tearoff=0)
        self.context_menu_secondary.add_command(label="Delete Character", command=self.delete_character_secondary)

        self.load_data("gmcheatsheet_data.json")

        self.master.protocol("WM_DELETE_WINDOW", self.on_closing)

    def add_character(self):
        character_name = simpledialog.askstring("Input", "Enter CHARACTER NAME:")
        if character_name:
            row_data = [character_name] + ["0" if col not in ["CHARACTER NAME", "Motivation", "Complication One", "Complication Two", "Summary"] else "" for col in self.columns[1:]]
            self.tree.insert("", "end", values=row_data)

    def upload_character(self):
        file_path = filedialog.askopenfilename(filetypes=[("Excel files", "*.xlsx *.xls")])
        if file_path:
            try:
                df = pd.read_excel(file_path, engine='openpyxl', header=None)
                character = {
                    'name': df.iloc[1, 10],  # K2
                    'stats': {
                        'Strength': {'value': int(df.iloc[17, 13]) if not pd.isna(df.iloc[17, 13]) else ''},  # N18
                        'Stamina': {'value': int(df.iloc[21, 13]) if not pd.isna(df.iloc[21, 13]) else ''},  # N22
                        'Agility': {'value': int(df.iloc[25, 13]) if not pd.isna(df.iloc[25, 13]) else ''},  # N26
                        'Dexterity': {'value': int(df.iloc[29, 13]) if not pd.isna(df.iloc[29, 13]) else ''},  # N30
                        'Fighting': {'value': int(df.iloc[33, 13]) if not pd.isna(df.iloc[33, 13]) else ''},  # N34
                        'Intellect': {'value': int(df.iloc[37, 13]) if not pd.isna(df.iloc[37, 13]) else ''},  # N38
                        'Awareness': {'value': int(df.iloc[41, 13]) if not pd.isna(df.iloc[41, 13]) else ''},  # N42
                        'Presence': {'value': int(df.iloc[45, 13]) if not pd.isna(df.iloc[45, 13]) else ''},  # N46
                    },
                    'defenses': {
                        'Dodge': df.iloc[17, 25]['total_rank'] if isinstance(df.iloc[17, 25], dict) else df.iloc[17, 25],  # Z18
                        'Fortitude': df.iloc[20, 25]['total_rank'] if isinstance(df.iloc[20, 25], dict) else df.iloc[20, 25],  # Z21
                        'Parry': df.iloc[23, 25]['total_rank'] if isinstance(df.iloc[23, 25], dict) else df.iloc[23, 25],  # Z24
                        'Will': df.iloc[26, 25]['total_rank'] if isinstance(df.iloc[26, 25], dict) else df.iloc[26, 25],  # Z27
                        'Toughness': df.iloc[29, 25]['total_rank'] if isinstance(df.iloc[29, 25], dict) else df.iloc[29, 25],  # Z30
                    },
                    'initiative': int(df.iloc[17, 36]) if not pd.isna(df.iloc[17, 36]) else '',  # AK18
                    'Motivation': {
                        'name': str(df.iloc[87, 5]) if not pd.isna(df.iloc[87, 5]) else '',  # F88
                    },
                    'Complications': [
                        str(df.iloc[87, 36]) if not pd.isna(df.iloc[87, 36]) else '',  # AK88
                        str(df.iloc[89, 36]) if not pd.isna(df.iloc[89, 36]) else '',  # AK90
                    ]
                }

                row_data = [
                    character['name'],
                    character['stats'].get('Strength', {}).get('value', ''),
                    character['stats'].get('Stamina', {}).get('value', ''),
                    character['stats'].get('Agility', {}).get('value', ''),
                    character['stats'].get('Dexterity', {}).get('value', ''),
                    character['stats'].get('Fighting', {}).get('value', ''),
                    character['stats'].get('Intellect', {}).get('value', ''),
                    character['stats'].get('Awareness', {}).get('value', ''),
                    character['stats'].get('Presence', {}).get('value', ''),
                    character['defenses'].get('Dodge', {}).get('total_rank', ''),
                    character['defenses'].get('Parry', {}).get('total_rank', ''),
                    character['defenses'].get('Fortitude', {}).get('total_rank', ''),
                    character['defenses'].get('Toughness', {}).get('total_rank', ''),
                    character['defenses'].get('Will', {}).get('total_rank', ''),
                    character['initiative'],
                    character['Motivation']['name'],
                    character['Complications'][0],
                    character['Complications'][1],
                    ""  # Summary field
                ]

                self.tree.insert("", "end", values=row_data)
                self.import_character_secondary(character)

            except Exception as e:
                messagebox.showerror("Error", f"Failed to upload character: {e}")

    def save_data(self, filename="gmcheatsheet_data.json"):
        data = {'primary': [], 'secondary': []}
        for item in self.tree.get_children():
            values = self.tree.item(item, "values")
            row_data = {self.columns[i]: values[i] for i in range(len(self.columns))}
            data['primary'].append(row_data)

        for item in self.tree_secondary.get_children():
            values = self.tree_secondary.item(item, "values")
            row_data = {self.secondary_columns[i]: values[i] for i in range(len(self.secondary_columns))}
            data['secondary'].append(row_data)

        with open(filename, "w") as f:
            json.dump(data, f, indent=4)

    def load_data(self, filename="gmcheatsheet_data.json"):
        if os.path.exists(filename):
            with open(filename, "r") as f:
                data = json.load(f)

            for item in self.tree.get_children():
                self.tree.delete(item)

            for row in data['primary']:
                values = [row.get(col, "") for col in self.columns]  # Use .get to handle missing keys
                self.tree.insert("", "end", values=values)

            for item in self.tree_secondary.get_children():
                self.tree_secondary.delete(item)

            for row in data['secondary']:
                values = [row.get(col, "") for col in self.secondary_columns]  # Use .get to handle missing keys
                self.tree_secondary.insert("", "end", values=values)

    def load_manual_file(self):
        file_path = filedialog.askopenfilename(filetypes=[("JSON files", "*.json")])
        if file_path:
            self.load_data(file_path)

    def on_closing(self):
        self.save_data()
        self.master.destroy()

    def on_double_click(self, event):
        selected_items = self.tree.selection()
        if not selected_items:
            return

        item = selected_items[0]
        column = self.tree.identify_column(event.x)
        column_index = int(column[1:]) - 1

        def save_edit(event):
            self.tree.set(item, column, entry.get())
            entry.destroy()
            self.focus_next_cell(item, column_index)

        def cancel_edit(event):
            entry.destroy()
            self.focus_next_cell(item, column_index)

        cell_bbox = self.tree.bbox(item, column)
        if cell_bbox:
            x, y, width, height = cell_bbox
            entry = tk.Entry(self.tree)
            entry.place(x=x, y=y, width=width, height=height, anchor="nw")
            entry.insert(0, self.tree.item(item, "values")[column_index])
            entry.bind("<Return>", save_edit)
            entry.bind("<Tab>", save_edit)
            entry.bind("<FocusOut>", cancel_edit)
            entry.focus()
            entry.select_range(0, tk.END)

    def focus_next_cell(self, item, column_index):
        next_column_index = (column_index + 1) % len(self.columns)
        next_column = f"#{next_column_index + 1}"
        self.tree.focus(item)
        self.tree.selection_set(item)
        self.tree.see(item)
        self.tree.bbox(item, next_column)
        self.on_double_click_create_entry(item, next_column_index)

    def on_double_click_create_entry(self, item, column_index):
        def save_edit(event):
            self.tree.set(item, f"#{column_index + 1}", entry.get())
            entry.destroy()
            self.focus_next_cell(item, column_index)

        def cancel_edit(event):
            entry.destroy()

        cell_bbox = self.tree.bbox(item, f"#{column_index + 1}")
        if cell_bbox:
            x, y, width, height = cell_bbox
            entry = tk.Entry(self.tree)
            entry.place(x=x, y=y, width=width, height=height, anchor="nw")
            entry.insert(0, self.tree.item(item, "values")[column_index])
            entry.bind("<Return>", save_edit)
            entry.bind("<Tab>", save_edit)
            entry.bind("<FocusOut>", cancel_edit)
            entry.focus()
            entry.select_range(0, tk.END)

    def show_context_menu(self, event):
        self.context_menu.tk_popup(event.x_root, event.y_root)

    def delete_character(self):
        selected_items = self.tree.selection()
        if not selected_items:
            return
        for item in selected_items:
            self.tree.delete(item)

    def on_hover(self, event):
        region = self.tree.identify_region(event.x, event.y)
        if region == "cell":
            item = self.tree.identify_row(event.y)
            column = self.tree.identify_column(event.x)
            column_index = int(column[1:]) - 1
            if item and column_index in [15, 16, 17, 18]:  # Motivation, Complication One, Complication Two, Summary
                bbox = self.tree.bbox(item, column)
                if bbox:
                    x, y, width, height = bbox
                    values = self.tree.item(item, "values")
                    if values:
                        text = values[column_index]
                        self.tooltip.show(text, x, y)
                    else:
                        self.tooltip.hide()
                else:
                    self.tooltip.hide()
            else:
                self.tooltip.hide()
        else:
            self.tooltip.hide()

    def import_character(self, character):
        row_data = [
            character['name'],
            character['stats'].get('Strength', {}).get('value', ''),
            character['stats'].get('Stamina', {}).get('value', ''),
            character['stats'].get('Agility', {}).get('value', ''),
            character['stats'].get('Dexterity', {}).get('value', ''),
            character['stats'].get('Fighting', {}).get('value', ''),
            character['stats'].get('Intellect', {}).get('value', ''),
            character['stats'].get('Awareness', {}).get('value', ''),
            character['stats'].get('Presence', {}).get('value', ''),
            character['defenses'].get('Dodge', {}).get('total_rank', ''),
            character['defenses'].get('Parry', {}).get('total_rank', ''),
            character['defenses'].get('Fortitude', {}).get('total_rank', ''),
            character['defenses'].get('Toughness', {}).get('total_rank', ''),
            character['defenses'].get('Will', {}).get('total_rank', ''),
            character['initiative'],
            character['Motivation']['name'],
            character['Complications'][0],
            character['Complications'][1],
            ""  # Summary field
        ]
        self.tree.insert("", "end", values=row_data)
        self.import_character_secondary(character)

    def import_character_secondary(self, character):
        powers_data = [character['name']]
        for power in character.get('powers', []):
            power_info = f"{power['name']} (Rank: {power['rank']}, Cost: {power['cost']})"
            if 'resisted' in power:
                power_info += f"\n  Resisted by: {power['resisted']}"
            if power.get('type') == 'Combat':
                accuracy = calculate_accuracy(character, power)
                power_info += f"\n  Accuracy: {accuracy}"
            if 'extras' in power and power['extras']:
                extras_details = ", ".join([f"{extra_name} (Rank: {extra_rank})" for extra_name, extra_rank in zip(power['extras'], power['extras_ranks'])])
                power_info += f"\n- Extras: {extras_details}"
            if 'flaws' in power and power['flaws']:
                flaws_details = ", ".join([f"{flaw_name} (Rank: {flaw_rank})" for flaw_name, flaw_rank in zip(power['flaws'], power['flaws_ranks'])])
                power_info += f"\n- Flaws: {flaws_details}"
            if 'increased_range' in power:
                power_info += f"\n- Increased Range: {power['increased_range']} feet"
            if 'failure_effects' in power:
                failure_effects = ", ".join(power['failure_effects'])
                power_info += f"\n- Failure Effects: {failure_effects}"
            powers_data.append(power_info)

        # Ensure the powers_data has the correct number of columns
        while len(powers_data) < len(self.secondary_columns) - 2:
            powers_data.append("")

        # Add skills and advantages
        skills_info = ", ".join([f"{skill['name']} (Rank: {skill['rank']})" for skill in character.get('skills', [])])
        advantages_info = ", ".join([f"{advantage['name']} (Rank: {advantage['rank']})" for advantage in character.get('advantages', [])])

        powers_data.extend([skills_info, advantages_info])

        self.tree_secondary.insert("", "end", values=powers_data)

        # Adjust the row height
        self.adjust_row_height(self.tree_secondary)

    def adjust_row_height(self, tree):
        style = ttk.Style()
        style.configure("Treeview", rowheight=40)  # Adjust the height as needed

    def on_double_click_secondary(self, event):
        selected_items = self.tree_secondary.selection()
        if not selected_items:
            return

        item = selected_items[0]
        column = self.tree_secondary.identify_column(event.x)
        column_index = int(column[1:]) - 1

        def save_edit(event):
            self.tree_secondary.set(item, column, entry.get())
            entry.destroy()
            self.focus_next_cell_secondary(item, column_index)

        def cancel_edit(event):
            entry.destroy()
            self.focus_next_cell_secondary(item, column_index)

        cell_bbox = self.tree_secondary.bbox(item, column)
        if cell_bbox:
            x, y, width, height = cell_bbox
            entry = tk.Entry(self.tree_secondary)
            entry.place(x=x, y=y, width=width, height=height, anchor="nw")
            entry.insert(0, self.tree_secondary.item(item, "values")[column_index])
            entry.bind("<Return>", save_edit)
            entry.bind("<Tab>", save_edit)
            entry.bind("<FocusOut>", cancel_edit)
            entry.focus()
            entry.select_range(0, tk.END)

    def focus_next_cell_secondary(self, item, column_index):
        next_column_index = (column_index + 1) % len(self.secondary_columns)
        next_column = f"#{next_column_index + 1}"
        self.tree_secondary.focus(item)
        self.tree_secondary.selection_set(item)
        self.tree_secondary.see(item)
        self.tree_secondary.bbox(item, next_column)
        self.on_double_click_create_entry_secondary(item, next_column_index)

    def on_double_click_create_entry_secondary(self, item, column_index):
        def save_edit(event):
            self.tree_secondary.set(item, f"#{column_index + 1}", entry.get())
            entry.destroy()
            self.focus_next_cell_secondary(item, column_index)

        def cancel_edit(event):
            entry.destroy()

        cell_bbox = self.tree_secondary.bbox(item, f"#{column_index + 1}")
        if cell_bbox:
            x, y, width, height = cell_bbox
            entry = tk.Entry(self.tree_secondary)
            entry.place(x=x, y=y, width=width, height=height, anchor="nw")
            entry.insert(0, self.tree_secondary.item(item, "values")[column_index])
            entry.bind("<Return>", save_edit)
            entry.bind("<Tab>", save_edit)
            entry.bind("<FocusOut>", cancel_edit)
            entry.focus()
            entry.select_range(0, tk.END)

    def show_context_menu_secondary(self, event):
        self.context_menu_secondary.tk_popup(event.x_root, event.y_root)

    def delete_character_secondary(self):
        selected_items = self.tree_secondary.selection()
        if not selected_items:
            return
        for item in selected_items:
            self.tree_secondary.delete(item)

    def on_hover_secondary(self, event):
        region = self.tree_secondary.identify_region(event.x, event.y)
        if region == "cell":
            item = self.tree_secondary.identify_row(event.y)
            column = self.tree_secondary.identify_column(event.x)
            column_index = int(column[1:]) - 1
            if item:
                bbox = self.tree_secondary.bbox(item, column)
                if bbox:
                    x, y, width, height = bbox
                    values = self.tree_secondary.item(item, "values")
                    if values:
                        text = values[column_index].replace(", ", "\n")  # Display text vertically
                        self.tooltip_secondary.show(text, x, y)
                    else:
                        self.tooltip_secondary.hide()
                else:
                    self.tooltip_secondary.hide()
            else:
                self.tooltip_secondary.hide()
        else:
            self.tooltip_secondary.hide()

def open_gm_cheat_sheet():
    global gm_cheat_sheet_app
    if gm_cheat_sheet_app is None or not gm_cheat_sheet_app.master.winfo_exists():
        gm_cheat_sheet_window = tk.Toplevel()
        gm_cheat_sheet_app = GMcheatSheetApp(gm_cheat_sheet_window)
    return gm_cheat_sheet_app

if __name__ == "__main__":
    root = tk.Tk()
    app = GMcheatSheetApp(root)
    root.mainloop()
