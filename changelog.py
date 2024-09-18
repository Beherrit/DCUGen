import tkinter as tk
from tkinter import ttk
from ttkbootstrap import Style

def open_changelog(root):
    # Function to open the changelog file
    with open("changelogs.py", "r") as file:
        changelog_content = file.read()
    
    # Create a new window
    changelog_window = tk.Toplevel(root)
    changelog_window.title("Changelog")
    changelog_window.geometry("800x600")  # Set a default size

    # Create a frame to hold the text widget and scrollbar
    frame = ttk.Frame(changelog_window)
    frame.pack(expand=True, fill='both', padx=10, pady=10)

    # Create a text widget with a scrollbar
    text_widget = tk.Text(frame, wrap='word', font=("Courier", 10))
    text_widget.pack(side='left', expand=True, fill='both')

    scrollbar = ttk.Scrollbar(frame, orient='vertical', command=text_widget.yview)
    scrollbar.pack(side='right', fill='y')

    text_widget.configure(yscrollcommand=scrollbar.set)

    # Insert the changelog content
    text_widget.insert('1.0', changelog_content)

    # Make the text widget read-only
    text_widget.configure(state='disabled')

    # Apply some tags for styling
    text_widget.tag_configure("header", font=("Courier", 12, "bold"))
    text_widget.tag_configure("subheader", font=("Courier", 10, "bold"))

    # Apply the tags (assuming a specific format in the changelog)
    lines = changelog_content.split('\n')
    for i, line in enumerate(lines):
        if line.startswith('# '):
            text_widget.tag_add("header", f"{i+1}.0", f"{i+1}.end")
        elif line.startswith('## '):
            text_widget.tag_add("subheader", f"{i+1}.0", f"{i+1}.end")

    # Add a close button
    close_button = ttk.Button(changelog_window, text="Close", command=changelog_window.destroy)
    close_button.pack(pady=10)
