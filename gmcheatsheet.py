import tkinter as tk
from tkinter import ttk, filedialog, simpledialog, messagebox
import json

class GMcheatSheetApp:
    def __init__(self, master):
        self.master = master
        self.master.title("GM Cheat Sheet")
        self.master.geometry("1600x600")

        self.frame = tk.Frame(self.master)
        self.frame.pack(fill="both", expand=True)

        self.add_button = ttk.Button(self.frame, text="Add New Character", command=self.add_character)
        self.add_button.pack(pady=10)

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

    def add_character(self):
        character_name = simpledialog.askstring("Input", "Enter CHARACTER NAME:")
        if character_name:
            row_data = [character_name] + ["0" if col not in ["CHARACTER NAME", "Motivation", "Complication One", "Complication Two", "Summary"] else "" for col in self.columns[1:]]
            self.tree.insert("", "end", values=row_data)

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
        item = self.tree.selection()[0]
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

def open_gm_cheat_sheet():
    gm_cheat_sheet_window = tk.Toplevel()
    GMcheatSheetApp(gm_cheat_sheet_window)

if __name__ == "__main__":
    root = tk.Tk()
    GMcheatSheetApp(root)
    root.mainloop()
