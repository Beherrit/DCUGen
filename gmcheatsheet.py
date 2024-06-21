import tkinter as tk
from tkinter import ttk, filedialog, simpledialog, messagebox
import pandas as pd
import json

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
        self.master.geometry("1600x600")

        self.frame = tk.Frame(self.master)
        self.frame.pack(fill="both", expand=True)

        self.add_button = ttk.Button(self.frame, text="Add New Character", command=self.add_character)
        self.add_button.pack(pady=10)

        self.upload_button = ttk.Button(self.frame, text="Upload Character", command=self.upload_character)
        self.upload_button.pack(pady=10)

        self.save_button = ttk.Button(self.frame, text="Save", command=self.save_data)
        self.save_button.pack(pady=10)

        self.load_button = ttk.Button(self.frame, text="Load", command=self.load_data)
        self.load_button.pack(pady=10)

        self.tree_frame = tk.Frame(self.frame)
        self.tree_frame.pack(fill="both", expand=True, padx=20, pady=20)

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
            self.tree.heading(col, text=col)
            self.tree.column(col, width=100, stretch=True)

        self.tree.pack(side="left", fill="both", expand=True)
        self.tree_scroll_y.config(command=self.tree.yview)
        self.tree_scroll_x.config(command=self.tree.xview)

        self.tree.bind("<Double-1>", self.on_double_click)
        self.tree.bind("<Motion>", self.on_hover)

        self.tooltip = Tooltip(self.tree)

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
                        'Strength': {'value': int(df.iloc[13, 13]) if not pd.isna(df.iloc[13, 13]) else ''},  # N14
                        'Stamina': {'value': int(df.iloc[17, 13]) if not pd.isna(df.iloc[17, 13]) else ''},  # N18
                        'Agility': {'value': int(df.iloc[21, 13]) if not pd.isna(df.iloc[21, 13]) else ''},  # N22
                        'Dexterity': {'value': int(df.iloc[25, 13]) if not pd.isna(df.iloc[25, 13]) else ''},  # N26
                        'Fighting': {'value': int(df.iloc[29, 13]) if not pd.isna(df.iloc[29, 13]) else ''},  # N30
                        'Intellect': {'value': int(df.iloc[33, 13]) if not pd.isna(df.iloc[33, 13]) else ''},  # N34
                        'Awareness': {'value': int(df.iloc[37, 13]) if not pd.isna(df.iloc[37, 13]) else ''},  # N38
                        'Presence': {'value': int(df.iloc[41, 13]) if not pd.isna(df.iloc[41, 13]) else ''},  # N42
                    },
                    'defenses': {
                        'Dodge': int(df.iloc[14, 26]) if not pd.isna(df.iloc[14, 26]) else '',  # AA15
                        'Fortitude': int(df.iloc[17, 26]) if not pd.isna(df.iloc[17, 26]) else '',  # AA18
                        'Parry': int(df.iloc[20, 26]) if not pd.isna(df.iloc[20, 26]) else '',  # AA21
                        'Willpower': int(df.iloc[23, 26]) if not pd.isna(df.iloc[23, 26]) else '',  # AA24
                        'Toughness': int(df.iloc[26, 26]) if not pd.isna(df.iloc[26, 26]) else '',  # AA27
                    },
                    'initiative': int(df.iloc[14, 37]) if not pd.isna(df.iloc[14, 37]) else '',  # AL15
                    'Motivation': {
                        'name': str(df.iloc[83, 5]).split(':')[0] if isinstance(df.iloc[83, 5], str) else '',
                        'description': str(df.iloc[83, 5]).split(':')[1].strip() if isinstance(df.iloc[83, 5], str) and ':' in df.iloc[83, 5] else '',
                    },
                    'Complications': [
                        str(df.iloc[85, 5]) if not pd.isna(df.iloc[85, 5]) else '',  # F86
                        str(df.iloc[83, 35]) if not pd.isna(df.iloc[83, 35]) else '',  # AJ84
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
                    character['defenses'].get('Dodge', ''),
                    character['defenses'].get('Fortitude', ''),
                    character['defenses'].get('Parry', ''),
                    character['defenses'].get('Willpower', ''),
                    character['defenses'].get('Toughness', ''),
                    character['initiative'],
                    f"{character['Motivation']['name']}: {character['Motivation']['description']}",
                    character['Complications'][0],
                    character['Complications'][1],
                    ""  # Summary field
                ]

                self.tree.insert("", "end", values=row_data)
            except Exception as e:
                messagebox.showerror("Error", f"Failed to upload character: {e}")

    def save_data(self):
        data = []
        for item in self.tree.get_children():
            values = self.tree.item(item, "values")
            row_data = {self.columns[i]: values[i] for i in range(len(self.columns))}
            data.append(row_data)

        filename = filedialog.asksaveasfilename(defaultextension=".json", filetypes=[("JSON files", "*.json")])
        if filename:
            with open(filename, "w") as f:
                json.dump(data, f, indent=4)
            messagebox.showinfo("Save", "Data saved successfully!")

    def load_data(self):
        filename = filedialog.askopenfilename(filetypes=[("JSON files", "*.json")])
        if filename:
            with open(filename, "r") as f:
                data = json.load(f)

            for item in self.tree.get_children():
                self.tree.delete(item)

            for row in data:
                values = [row[col] for col in self.columns]
                self.tree.insert("", "end", values=values)
            messagebox.showinfo("Load", "Data loaded successfully!")

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

def open_gm_cheat_sheet():
    gm_cheat_sheet_window = tk.Toplevel()
    GMcheatSheetApp(gm_cheat_sheet_window)

if __name__ == "__main__":
    root = tk.Tk()
    GMcheatSheetApp(root)
    root.mainloop()
