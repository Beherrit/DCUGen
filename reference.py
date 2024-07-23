import tkinter as tk
from tkinter import ttk, messagebox
from PIL import Image, ImageTk
import os
import json

def open_reference_data():
    # Load image mappings from JSON file
    with open('./json/image_mappings.json', 'r') as f:
        image_mappings = json.load(f)

    # Define image mappings for each category
    categories = {
        "Actions": image_mappings.get("actions", {}),
        "Environmental": image_mappings.get("environmental", {}),
        "Maneuvers": image_mappings.get("maneuvers", {}),
        "Extras": image_mappings.get("extras", {}),
        "Flaws": image_mappings.get("flaws", {}),
        "BMT Skills *": image_mappings.get("bmt_skills", {})
    }

    # Create a new top-level window
    ref_window = tk.Toplevel()
    ref_window.title("Reference Data")
    ref_window.geometry("800x600")  # Set the base starting size

    # Frame for dropdowns
    dropdown_frame = ttk.Frame(ref_window)
    dropdown_frame.pack(pady=(10, 10))

    # Dictionary to hold images
    images = {}

    def load_images():
        base_path = os.path.join(os.path.dirname(__file__), 'images')
        for category in categories.keys():
            if category == "BMT Skills *":
                category_path = os.path.join(base_path, "bmt_skills")
            else:
                category_path = os.path.join(base_path, category.lower().replace(' ', '_'))
            
            if os.path.exists(category_path):
                for filename in os.listdir(category_path):
                    if filename.lower().endswith('.jpg'):
                        img_path = os.path.join(category_path, filename)
                        try:
                            img = Image.open(img_path)
                            img = ImageTk.PhotoImage(img)
                            images[filename.lower()] = img
                        except Exception as e:
                            print(f"Error loading image {img_path}: {e}")
            else:
                print(f"Category path not found: {category_path}")


    # Load images at the start
    load_images()

    # Main category dropdown
    main_category_var = tk.StringVar()
    main_category_cb = ttk.Combobox(dropdown_frame, textvariable=main_category_var, values=list(categories.keys()), state="readonly")
    main_category_cb.grid(row=0, column=0, padx=5, pady=5)

    # Subcategory dropdown
    subcategory_var = tk.StringVar()
    subcategory_cb = ttk.Combobox(dropdown_frame, textvariable=subcategory_var, state="readonly")
    subcategory_cb.grid(row=0, column=1, padx=5, pady=5)

    # Update subcategories based on main category selection
    def update_subcategories(event):
        selected_category = main_category_var.get()
        if selected_category:
            subcategories = list(categories[selected_category].keys())
            subcategory_cb.config(values=subcategories)
            subcategory_cb.set("")

    main_category_cb.bind("<<ComboboxSelected>>", update_subcategories)

    # Canvas and Scrollbar setup
    canvas = tk.Canvas(ref_window)
    scrollbar = ttk.Scrollbar(ref_window, orient="vertical", command=canvas.yview)
    scrollable_frame = ttk.Frame(canvas)

    scrollable_frame.bind(
        "<Configure>",
        lambda e: canvas.configure(
            scrollregion=canvas.bbox("all")
        )
    )

    canvas.create_window((0, 0), window=scrollable_frame, anchor="nw")
    canvas.configure(yscrollcommand=scrollbar.set)

    # Pack the canvas and scrollbar
    canvas.pack(side="left", fill="both", expand=True)
    scrollbar.pack(side="right", fill="y")

    # Function to scroll with mouse wheel
    def on_mouse_wheel(event):
        canvas.yview_scroll(int(-1*(event.delta/120)), "units")

    # Function to scroll with arrow keys
    def on_arrow_key(event):
        if event.keysym == "Up":
            canvas.yview_scroll(-1, "units")
        elif event.keysym == "Down":
            canvas.yview_scroll(1, "units")

    # Bind mouse wheel and arrow keys to scroll
    ref_window.bind_all("<MouseWheel>", on_mouse_wheel)
    ref_window.bind_all("<Up>", on_arrow_key)
    ref_window.bind_all("<Down>", on_arrow_key)

    # Label to display image
    image_label = ttk.Label(scrollable_frame)
    image_label.pack(pady=10)

    # Function to handle selection and display image
    def handle_selection(event):
        selected_category = main_category_var.get()
        selected_item = subcategory_var.get()
        if selected_category and selected_item:
            image_file = categories[selected_category][selected_item].lower()
            if image_file in images:
                image_label.config(image=images[image_file])
            else:
                messagebox.showinfo("Image Not Found", f"No image found for {selected_item}")

    # Bind the subcategory combobox to the handle_selection function
    subcategory_cb.bind("<<ComboboxSelected>>", handle_selection)

    # Search bar setup
    search_label = ttk.Label(ref_window, text="Search Image:")
    search_label.pack(pady=(10, 5))

    search_frame = ttk.Frame(ref_window)
    search_frame.pack(pady=(0, 10))

    search_var = tk.StringVar()
    search_entry = ttk.Entry(search_frame, textvariable=search_var, width=50)
    search_entry.pack(side="left", padx=(5, 5))

    search_results_frame = ttk.Frame(ref_window)
    search_results_frame.pack(pady=(0, 10))

    # Listbox to display search results
    search_results_listbox = tk.Listbox(search_results_frame, width=50, height=10)
    search_results_listbox.pack(side="left", fill="y")

    search_results_scrollbar = ttk.Scrollbar(search_results_frame, orient="vertical")
    search_results_scrollbar.config(command=search_results_listbox.yview)
    search_results_scrollbar.pack(side="left", fill="y")

    search_results_listbox.config(yscrollcommand=search_results_scrollbar.set)

    # Function to search images
    def search_images(query):
        search_results_listbox.delete(0, tk.END)
        query = query.lower()

        all_image_maps = {k: v for d in categories.values() for k, v in d.items()}

        for name, image_file in all_image_maps.items():
            if query in name.lower():
                search_results_listbox.insert(tk.END, name)

    # Function to handle image selection from search results
    def handle_search_selection(event):
        if not search_results_listbox.curselection():
            return
        selected_name = search_results_listbox.get(search_results_listbox.curselection())
        
        all_image_maps = {k: v for d in categories.values() for k, v in d.items()}
        image_file = all_image_maps[selected_name].lower()
        
        if image_file and image_file in images:
            image_label.config(image=images[image_file])

    # Bind the listbox selection to the handle_search_selection function
    search_results_listbox.bind("<<ListboxSelect>>", handle_search_selection)

    # Update search results in real-time as the user types
    search_var.trace_add("write", lambda name, index, mode: search_images(search_var.get()))

    # Add non-core materials note
    non_core_note = ttk.Label(ref_window, text="* Are Non-core materials", font=("Arial", 8, "italic"))
    non_core_note.pack(side="bottom", pady=10)

# Sample code to open the reference data window
if __name__ == "__main__":
    root = tk.Tk()
    root.title("Main Window")
    open_ref_button = ttk.Button(root, text="Open Reference Data", command=open_reference_data)
    open_ref_button.pack(pady=20)
    root.mainloop()
