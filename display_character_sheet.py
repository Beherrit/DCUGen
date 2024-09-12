import tkinter as tk
from tkinter import ttk
from PIL import Image, ImageTk, ImageDraw, ImageFont
import excel2img
import os
import tempfile
import openpyxl

def display_excel_data(file_path, notebook):
    # Load the workbook to get the character name
    workbook = openpyxl.load_workbook(file_path, read_only=True)
    sheet = workbook.active
    character_name = sheet['K2'].value or "Unnamed Character"

    # Create a new tab in the notebook
    tab = ttk.Frame(notebook)
    notebook.add(tab, text=f"{character_name}")

    # Create canvas to display Excel data
    canvas = tk.Canvas(tab)
    canvas.pack(expand=True, fill="both")

    # Create scrollbars
    vscrollbar = ttk.Scrollbar(tab, orient="vertical", command=canvas.yview)
    hscrollbar = ttk.Scrollbar(tab, orient="horizontal", command=canvas.xview)
    vscrollbar.pack(side="right", fill="y")
    hscrollbar.pack(side="bottom", fill="x")

    canvas.configure(yscrollcommand=vscrollbar.set, xscrollcommand=hscrollbar.set)

    # Create a temporary file to save the image
    with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp_file:
        temp_image_path = tmp_file.name

    # Get the correct sheet name
    sheet_name = workbook.sheetnames[0]  # Get the name of the first sheet

    try:
        # Convert Excel to image with specific range
        excel2img.export_img(file_path, temp_image_path, sheet_name, "A1:BI175")
    except Exception as e:
        print(f"Error exporting Excel to image: {e}")
        # If export fails, create a blank image with an error message
        image = Image.new('RGB', (800, 600), color='white')
        draw = ImageDraw.Draw(image)
        font = ImageFont.load_default()
        draw.text((10, 10), f"Error loading Excel file: {e}", fill='black', font=font)
        image.save(temp_image_path)

    # Open the image
    image = Image.open(temp_image_path)

    # Convert to PhotoImage
    photo = ImageTk.PhotoImage(image)

    # Add image to canvas
    canvas.create_image(0, 0, anchor="nw", image=photo)
    canvas.image = photo  # Keep a reference

    # Update canvas scrollable region
    canvas.config(scrollregion=canvas.bbox("all"))

    # Set initial view to top-left corner
    canvas.xview_moveto(0)
    canvas.yview_moveto(0)

    # Bind mouse wheel to vertical scrolling
    def _on_mousewheel(event):
        canvas.yview_scroll(int(-1*(event.delta/120)), "units")

    # Bind Shift + mouse wheel to horizontal scrolling
    def _on_shift_mousewheel(event):
        canvas.xview_scroll(int(-1*(event.delta/120)), "units")

    # Bind arrow keys to scrolling
    def _on_arrow_key(event):
        if event.keysym == 'Up':
            canvas.yview_scroll(-1, "units")
        elif event.keysym == 'Down':
            canvas.yview_scroll(1, "units")
        elif event.keysym == 'Left':
            canvas.xview_scroll(-1, "units")
        elif event.keysym == 'Right':
            canvas.xview_scroll(1, "units")

    # Bind events to the specific canvas
    canvas.bind("<MouseWheel>", _on_mousewheel)
    canvas.bind("<Shift-MouseWheel>", _on_shift_mousewheel)
    canvas.bind("<Up>", _on_arrow_key)
    canvas.bind("<Down>", _on_arrow_key)
    canvas.bind("<Left>", _on_arrow_key)
    canvas.bind("<Right>", _on_arrow_key)

    # Bind the canvas to focus when the mouse enters it
    canvas.bind("<Enter>", lambda e: canvas.focus_set())

    # Switch to the new tab
    notebook.select(tab)

    # Clean up the temporary file
    os.unlink(temp_image_path)

# No need for main function or Tkinter root here, as it's handled in DCUQA.py