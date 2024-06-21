import tkinter as tk
from tkinter import ttk, messagebox
from PIL import Image, ImageTk
import os
import json

def open_reference_data():
    # Load image mappings from JSON file
    with open('./json/image_mappings.json', 'r') as f:
        image_mappings = json.load(f)

    action_image_map = image_mappings.get("actions", {})
    env_image_map = image_mappings.get("environmental", {})
    maneuver_image_map = image_mappings.get("maneuvers", {})
    extra_image_map = image_mappings.get("extras", {})
    flaw_image_map = image_mappings.get("flaws", {})

    # Create a new top-level window
    ref_window = tk.Toplevel()
    ref_window.title("Reference Data")
    ref_window.geometry("800x600")  # Set the base starting size

    # Label for the combobox
    label = ttk.Label(ref_window, text="Select a Category:")
    label.pack(pady=(10, 5))

    # Frame for dropdowns
    dropdown_frame = ttk.Frame(ref_window)
    dropdown_frame.pack(pady=(0, 10))

    # Dictionary to hold images
    images = {}

    # Function to load images
    def load_images():
        base_path = os.path.join(os.path.dirname(__file__), 'images')
        for category in ['actions', 'environmental', 'maneuvers', 'extras', 'flaws']:
            category_path = os.path.join(base_path, category)
            if os.path.exists(category_path):
                for filename in os.listdir(category_path):
                    if filename.lower().endswith('.jpg'):
                        img_path = os.path.join(category_path, filename)
                        img = Image.open(img_path)
                        img = ImageTk.PhotoImage(img)
                        images[filename.lower()] = img

    # Load images at the start
    load_images()

    # Combobox setup for Actions
    action_label = ttk.Label(dropdown_frame, text="Actions:")
    action_label.grid(row=0, column=0, padx=5, pady=5)
    
    actions = list(action_image_map.keys())
    action_var = tk.StringVar()
    action_cb = ttk.Combobox(dropdown_frame, textvariable=action_var, values=actions, state="readonly")
    action_cb.grid(row=0, column=1, padx=5, pady=5)

    # Combobox setup for Environmental Hazards
    env_label = ttk.Label(dropdown_frame, text="Environmental Hazards:")
    env_label.grid(row=1, column=0, padx=5, pady=5)

    env_hazards = list(env_image_map.keys())
    env_var = tk.StringVar()
    env_cb = ttk.Combobox(dropdown_frame, textvariable=env_var, values=env_hazards, state="readonly")
    env_cb.grid(row=1, column=1, padx=5, pady=5)

    # Combobox setup for Maneuvers
    maneuver_label = ttk.Label(dropdown_frame, text="Maneuvers:")
    maneuver_label.grid(row=2, column=0, padx=5, pady=5)

    maneuvers = list(maneuver_image_map.keys())
    maneuver_var = tk.StringVar()
    maneuver_cb = ttk.Combobox(dropdown_frame, textvariable=maneuver_var, values=maneuvers, state="readonly")
    maneuver_cb.grid(row=2, column=1, padx=5, pady=5)

    # Combobox setup for Extras
    extra_label = ttk.Label(dropdown_frame, text="Extras:")
    extra_label.grid(row=3, column=0, padx=5, pady=5)

    extras = list(extra_image_map.keys())
    extra_var = tk.StringVar()
    extra_cb = ttk.Combobox(dropdown_frame, textvariable=extra_var, values=extras, state="readonly")
    extra_cb.grid(row=3, column=1, padx=5, pady=5)

    # Combobox setup for Flaws
    flaw_label = ttk.Label(dropdown_frame, text="Flaws:")
    flaw_label.grid(row=4, column=0, padx=5, pady=5)

    flaws = list(flaw_image_map.keys())
    flaw_var = tk.StringVar()
    flaw_cb = ttk.Combobox(dropdown_frame, textvariable=flaw_var, values=flaws, state="readonly")
    flaw_cb.grid(row=4, column=1, padx=5, pady=5)

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

    # Function to handle action selection and display image
    def handle_action_selection(event):
        selected_action = action_var.get()

        if selected_action:
            image_file = action_image_map[selected_action].lower()
            
            if image_file in images:
                image_label.config(image=images[image_file])
            else:
                messagebox.showinfo("Image Not Found", f"No image found for {selected_action}")

    # Function to handle environmental hazard selection and display image
    def handle_env_selection(event):
        selected_env = env_var.get()

        if selected_env:
            image_file = env_image_map[selected_env].lower()
            
            if image_file in images:
                image_label.config(image=images[image_file])
            else:
                messagebox.showinfo("Image Not Found", f"No image found for {selected_env}")

    # Function to handle maneuver selection and display image
    def handle_maneuver_selection(event):
        selected_maneuver = maneuver_var.get()

        if selected_maneuver:
            image_file = maneuver_image_map[selected_maneuver].lower()
            
            if image_file in images:
                image_label.config(image=images[image_file])
            else:
                messagebox.showinfo("Image Not Found", f"No image found for {selected_maneuver}")

    # Function to handle extra selection and display image
    def handle_extra_selection(event):
        selected_extra = extra_var.get()

        if selected_extra:
            image_file = extra_image_map[selected_extra].lower()
            
            if image_file in images:
                image_label.config(image=images[image_file])
            else:
                messagebox.showinfo("Image Not Found", f"No image found for {selected_extra}")

    # Function to handle flaw selection and display image
    def handle_flaw_selection(event):
        selected_flaw = flaw_var.get()

        if selected_flaw:
            image_file = flaw_image_map[selected_flaw].lower()
            
            if image_file in images:
                image_label.config(image=images[image_file])
            else:
                messagebox.showinfo("Image Not Found", f"No image found for {selected_flaw}")

    # Bind the comboboxes to their respective handle_selection functions
    action_cb.bind("<<ComboboxSelected>>", handle_action_selection)
    env_cb.bind("<<ComboboxSelected>>", handle_env_selection)
    maneuver_cb.bind("<<ComboboxSelected>>", handle_maneuver_selection)
    extra_cb.bind("<<ComboboxSelected>>", handle_extra_selection)
    flaw_cb.bind("<<ComboboxSelected>>", handle_flaw_selection)

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

        for name, image_file in {**action_image_map, **env_image_map, **maneuver_image_map, **extra_image_map, **flaw_image_map}.items():
            if query in name.lower():
                search_results_listbox.insert(tk.END, name)

    # Function to handle image selection from search results
    def handle_search_selection(event):
        if not search_results_listbox.curselection():
            return
        selected_name = search_results_listbox.get(search_results_listbox.curselection())
        
        # Determine the category to find the corresponding image file
        if selected_name in action_image_map:
            image_file = action_image_map[selected_name].lower()
        elif selected_name in env_image_map:
            image_file = env_image_map[selected_name].lower()
        elif selected_name in maneuver_image_map:
            image_file = maneuver_image_map[selected_name].lower()
        elif selected_name in extra_image_map:
            image_file = extra_image_map[selected_name].lower()
        elif selected_name in flaw_image_map:
            image_file = flaw_image_map[selected_name].lower()
        else:
            image_file = None
        
        if image_file and image_file in images:
            image_label.config(image=images[image_file])

    # Bind the listbox selection to the handle_search_selection function
    search_results_listbox.bind("<<ListboxSelect>>", handle_search_selection)

    # Update search results in real-time as the user types
    search_var.trace_add("write", lambda name, index, mode: search_images(search_var.get()))

# Sample code to open the reference data window
if __name__ == "__main__":
    root = tk.Tk()
    root.title("Main Window")
    open_ref_button = ttk.Button(root, text="Open Reference Data", command=open_reference_data)
    open_ref_button.pack(pady=20)
    root.mainloop()
