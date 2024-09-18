import tkinter as tk
from tkinter import filedialog, messagebox
import ttkbootstrap as ttk
from ttkbootstrap.constants import *
import json
from datetime import datetime
import sqlite3
from tooltip import ToolTip

class NotesApp:
    def __init__(self, master):
        self.master = master
        self.master.title("GM Notes")
        self.master.geometry("800x600")

        self.style = ttk.Style(theme="darkly")

        self.initialize_database()
        self.create_widgets()
        self.add_tooltips()
        self.load_notes_from_db()

    def create_widgets(self):
        # Main frame
        main_frame = ttk.Frame(self.master, padding="10")
        main_frame.pack(fill=BOTH, expand=YES)

        # Notes list
        self.notes_list = ttk.Treeview(main_frame, columns=("title", "date", "time"), show="headings")
        self.notes_list.heading("title", text="Title")
        self.notes_list.heading("date", text="Date")
        self.notes_list.heading("time", text="Time")
        self.notes_list.column("title", width=200)
        self.notes_list.column("date", width=100)
        self.notes_list.column("time", width=100)
        self.notes_list.pack(side=LEFT, fill=BOTH, expand=YES)
        self.notes_list.bind("<<TreeviewSelect>>", self.on_note_select)

        # Scrollbar for notes list
        notes_scroll = ttk.Scrollbar(main_frame, orient=VERTICAL, command=self.notes_list.yview)
        notes_scroll.pack(side=LEFT, fill=Y)
        self.notes_list.configure(yscrollcommand=notes_scroll.set)

        # Note content frame
        note_frame = ttk.Frame(main_frame, padding="10")
        note_frame.pack(side=RIGHT, fill=BOTH, expand=YES)

        # Note title
        self.note_title = ttk.Entry(note_frame, font=("TkDefaultFont", 14, "bold"))
        self.note_title.pack(fill=X, pady=(0, 10))

        # Note content
        self.note_content = ttk.Text(note_frame, wrap=WORD)
        self.note_content.pack(fill=BOTH, expand=YES)

        # Buttons frame
        btn_frame = ttk.Frame(self.master, padding="10")
        btn_frame.pack(fill=X)

        # Buttons
        ttk.Button(btn_frame, text="New Note", command=self.new_note).pack(side=LEFT, padx=5)
        ttk.Button(btn_frame, text="Save Note", command=self.save_note).pack(side=LEFT, padx=5)
        ttk.Button(btn_frame, text="Delete Note", command=self.delete_note).pack(side=LEFT, padx=5)
        ttk.Button(btn_frame, text="Export Notes", command=self.export_notes).pack(side=RIGHT, padx=5)
        ttk.Button(btn_frame, text="Import Notes", command=self.import_notes).pack(side=RIGHT, padx=5)

    def add_tooltips(self):
        ToolTip(self.notes_list, "List of all your notes")
        ToolTip(self.note_title, "Enter the title of your note")
        ToolTip(self.note_content, "Enter the content of your note")
        
        buttons = self.master.winfo_children()[-1].winfo_children()  # Get buttons from btn_frame
        ToolTip(buttons[0], "Create a new note")
        ToolTip(buttons[1], "Save the current note")
        ToolTip(buttons[2], "Delete the selected note")
        ToolTip(buttons[3], "Export all notes to a JSON file")
        ToolTip(buttons[4], "Import notes from a JSON file")

    def new_note(self):
        self.clear_note_fields()
        self.note_title.focus()

    def save_note(self):
        title = self.note_title.get().strip()
        content = self.note_content.get("1.0", END).strip()

        if not title or not content:
            return

        now = datetime.now()
        date = now.strftime("%Y-%m-%d")
        time = now.strftime("%H:%M:%S")

        selected = self.notes_list.selection()
        if selected:
            # Update existing note
            item_id = selected[0]
            self.notes_list.item(item_id, values=(title, date, time))
            self.update_note_in_db(item_id, title, content, date, time)
        else:
            # Add new note
            item_id = self.notes_list.insert("", END, values=(title, date, time))
            self.add_note_to_db(item_id, title, content, date, time)

    def delete_note(self):
        selected = self.notes_list.selection()
        if not selected:
            return

        item_id = selected[0]
        self.notes_list.delete(item_id)
        self.delete_note_from_db(item_id)
        self.clear_note_fields()

    def on_note_select(self, event):
        selected = self.notes_list.selection()
        if selected:
            item_id = selected[0]
            note = self.get_note_from_db(item_id)
            self.note_title.delete(0, END)
            self.note_title.insert(0, note['title'])
            self.note_content.delete("1.0", END)
            self.note_content.insert(END, note['content'])

    def clear_note_fields(self):
        self.note_title.delete(0, END)
        self.note_content.delete("1.0", END)
        for item in self.notes_list.selection():
            self.notes_list.selection_remove(item)

    def export_notes(self):
        filename = filedialog.asksaveasfilename(defaultextension=".json", filetypes=[("JSON files", "*.json")])
        if filename:
            notes = self.get_all_notes_from_db()
            with open(filename, "w") as f:
                json.dump(notes, f, indent=2)
            messagebox.showinfo("Export Successful", f"Notes exported to {filename}")

    def import_notes(self):
        filename = filedialog.askopenfilename(filetypes=[("JSON files", "*.json")])
        if filename:
            with open(filename, "r") as f:
                notes = json.load(f)
            self.import_notes_to_db(notes)
            self.load_notes_from_db()
            messagebox.showinfo("Import Successful", f"Notes imported from {filename}")

    # Database operations
    def initialize_database(self):
        conn = sqlite3.connect('gm_notes.db')
        cursor = conn.cursor()
        cursor.execute('''CREATE TABLE IF NOT EXISTS notes
                          (id TEXT PRIMARY KEY, title TEXT, content TEXT, date TEXT, time TEXT)''')
        conn.commit()
        conn.close()

    def add_note_to_db(self, item_id, title, content, date, time):
        conn = sqlite3.connect('gm_notes.db')
        cursor = conn.cursor()
        cursor.execute("INSERT INTO notes VALUES (?, ?, ?, ?, ?)", (item_id, title, content, date, time))
        conn.commit()
        conn.close()

    def update_note_in_db(self, item_id, title, content, date, time):
        conn = sqlite3.connect('gm_notes.db')
        cursor = conn.cursor()
        cursor.execute("UPDATE notes SET title=?, content=?, date=?, time=? WHERE id=?", 
                       (title, content, date, time, item_id))
        conn.commit()
        conn.close()

    def delete_note_from_db(self, item_id):
        conn = sqlite3.connect('gm_notes.db')
        cursor = conn.cursor()
        cursor.execute("DELETE FROM notes WHERE id=?", (item_id,))
        conn.commit()
        conn.close()

    def get_note_from_db(self, item_id):
        conn = sqlite3.connect('gm_notes.db')
        cursor = conn.cursor()
        cursor.execute("SELECT title, content FROM notes WHERE id=?", (item_id,))
        result = cursor.fetchone()
        conn.close()
        return {'title': result[0], 'content': result[1]} if result else None

    def get_all_notes_from_db(self):
        conn = sqlite3.connect('gm_notes.db')
        cursor = conn.cursor()
        cursor.execute("SELECT id, title, content, date, time FROM notes")
        results = cursor.fetchall()
        conn.close()
        return [{'id': r[0], 'title': r[1], 'content': r[2], 'date': r[3], 'time': r[4]} for r in results]

    def load_notes_from_db(self):
        self.notes_list.delete(*self.notes_list.get_children())
        notes = self.get_all_notes_from_db()
        for note in notes:
            self.notes_list.insert("", END, iid=note['id'], values=(note['title'], note['date'], note['time']))

    def import_notes_to_db(self, notes):
        conn = sqlite3.connect('gm_notes.db')
        cursor = conn.cursor()
        cursor.execute("DELETE FROM notes")  # Clear existing notes
        for note in notes:
            cursor.execute("INSERT INTO notes VALUES (?, ?, ?, ?, ?)", 
                           (note['id'], note['title'], note['content'], note['date'], note['time']))
        conn.commit()
        conn.close()

if __name__ == "__main__":
    root = ttk.Window()
    app = NotesApp(root)
    root.attributes('-topmost', True)  # Keep the window on top
    root.mainloop()
