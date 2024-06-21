import tkinter as tk
from tkinter import filedialog, Toplevel, Label, Entry, Text, Button, Scrollbar, VERTICAL, RIGHT, Y, BOTH
import sqlite3
from datetime import datetime

class NotesApp:
    def __init__(self, master):
        self.master = master
        self.master.title("Notes")
        self.notes = []

        self.frame = tk.Frame(self.master)
        self.frame.pack(fill="both", expand=True)

        self.notes_text = tk.Text(self.frame, height=20, width=50)
        self.notes_text.pack(expand=True, fill="both")

        self.save_button = tk.Button(self.frame, text="Save", command=self.save_notes_to_file)
        self.save_button.pack(side="left", padx=5, pady=5)

        self.load_button = tk.Button(self.frame, text="Load", command=self.load_notes_from_file)
        self.load_button.pack(side="left", padx=5, pady=5)

        self.new_note_button = tk.Button(self.frame, text="New Note", command=self.new_note)
        self.new_note_button.pack(side="left", padx=5, pady=5)

        self.initialize_database()
        self.load_notes_from_db()

        self.master.protocol("WM_DELETE_WINDOW", self.on_closing)

    def initialize_database(self):
        try:
            conn = sqlite3.connect('notes.db')
            cursor = conn.cursor()
            cursor.execute('''CREATE TABLE IF NOT EXISTS notes (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                name TEXT,
                                date TEXT,
                                time TEXT,
                                description TEXT
                            )''')
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"Error initializing database: {e}")

    def save_notes_to_file(self):
        filename = filedialog.asksaveasfilename(defaultextension=".txt", filetypes=[("Text files", "*.txt")])
        if filename:
            with open(filename, "w") as file:
                file.write(self.notes_text.get("1.0", "end-1c"))

    def load_notes_from_file(self):
        filename = filedialog.askopenfilename(filetypes=[("Text files", "*.txt")])
        if filename:
            with open(filename, "r") as file:
                self.notes_text.delete("1.0", "end")
                self.notes_text.insert("1.0", file.read())

    def new_note(self):
        note_window = Toplevel(self.master)
        note_window.title("New Note")

        note_name_label = Label(note_window, text="Note Name")
        note_name_label.pack()

        note_name_entry = Entry(note_window)
        note_name_entry.pack()

        note_description_label = Label(note_window, text="Note Details")
        note_description_label.pack()

        note_description_frame = tk.Frame(note_window)
        note_description_frame.pack(fill=BOTH, expand=True)

        note_description_text = Text(note_description_frame, wrap='word', height=10)
        note_description_text.pack(side='left', fill=BOTH, expand=True)

        scroll = Scrollbar(note_description_frame, command=note_description_text.yview, orient=VERTICAL)
        scroll.pack(side=RIGHT, fill=Y)

        note_description_text.config(yscrollcommand=scroll.set)

        def save_note():
            note_name = note_name_entry.get()
            note_description = note_description_text.get("1.0", "end-1c")
            if note_name and note_description:
                now = datetime.now()
                date = now.strftime("%Y-%m-%d")
                time = now.strftime("%H:%M:%S")
                self.notes_text.insert("end", f"{note_name} | {date} | {time}\n{note_description}\n\n")
                self.save_note_to_db(note_name, date, time, note_description)
                note_window.destroy()

        save_button = Button(note_window, text="Save", command=save_note)
        save_button.pack()

    def save_note_to_db(self, name, date, time, description):
        try:
            conn = sqlite3.connect('notes.db')
            cursor = conn.cursor()
            cursor.execute("INSERT INTO notes (name, date, time, description) VALUES (?, ?, ?, ?)",
                           (name, date, time, description))
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"Error saving note: {e}")

    def load_notes_from_db(self):
        try:
            conn = sqlite3.connect('notes.db')
            cursor = conn.cursor()
            cursor.execute("SELECT name, date, time, description FROM notes")
            rows = cursor.fetchall()
            for row in rows:
                self.notes_text.insert("end", f"{row[0]} | {row[1]} | {row[2]}\n{row[3]}\n\n")
            conn.close()
        except Exception as e:
            print(f"Error loading notes: {e}")

    def on_closing(self):
        try:
            self.master.after(100, self.save_notes_and_close)
        except Exception as e:
            print(f"Error on closing: {e}")

    def save_notes_and_close(self):
        try:
            notes_content = self.notes_text.get("1.0", "end-1c").strip()
            notes = notes_content.split("\n\n") if notes_content else []
            conn = sqlite3.connect('notes.db')
            cursor = conn.cursor()
            cursor.execute('DELETE FROM notes')  # Clear the table
            for note in notes:
                lines = note.strip().split("\n")
                if len(lines) >= 2:
                    header = lines[0].split('|')
                    if len(header) == 3:
                        name = header[0].strip()
                        date = header[1].strip()
                        time = header[2].strip()
                        description = "\n".join(lines[1:])
                        cursor.execute("INSERT INTO notes (name, date, time, description) VALUES (?, ?, ?, ?)",
                                       (name, date, time, description))
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"Error saving notes: {e}")
        finally:
            self.master.destroy()

def open_notes_window():
    notes_window = tk.Toplevel()
    NotesApp(notes_window)

if __name__ == "__main__":
    root = tk.Tk()
    NotesApp(root)
    root.mainloop()
