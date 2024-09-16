import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from PIL import Image, ImageTk, ImageDraw
import json
import os
import shutil
from ttkbootstrap import Style
import pygame  # For music playback
import mutagen  # For getting music metadata
import math

class MapEditor:
    def __init__(self, master):
        self.master = master
        self.master.title("GM Map")
        self.master.overrideredirect(False)
        self.master.resizable(True, True)
        self.master.grab_set()
        self.style = Style(theme='darkly')
        self.grid_size = 50
        self.tokens = {}
        self.image_locked = False
        self.grid_locked = False
        self.map_locked = False  # We can keep this for future use
        self.main_frame = ttk.Frame(self.master)
        self.main_frame.pack(fill=tk.BOTH, expand=True)
        self.setup_ui()
        self.add_resize_grip()
        self.frame = ttk.Frame(self.main_frame)
        self.frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        self.canvas = tk.Canvas(self.frame)
        self.canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        self.scrollbar_x = ttk.Scrollbar(self.frame, orient=tk.HORIZONTAL, command=self.canvas.xview)
        self.scrollbar_x.pack(side=tk.BOTTOM, fill=tk.X)
        self.scrollbar_y = ttk.Scrollbar(self.frame, orient=tk.VERTICAL, command=self.canvas.yview)
        self.scrollbar_y.pack(side=tk.RIGHT, fill=tk.Y)
        
        self.canvas.configure(xscrollcommand=self.scrollbar_x.set, yscrollcommand=self.scrollbar_y.set)
        
        self.zoom_factor = 1.0
        self.range_start = None
        self.range_line = None
        self.range_text = None
        self.setup_bindings()
        self.create_notes_window()
        
        self.library_visible = False
        self.library_frame = None
        self.library_data = {"maps": [], "tokens": [], "music": []}
        self.setup_library()
        self.load_library_data()
        
        self.dragging = False
        self.drag_item = None
        self.drag_token = None
        self.drag_token_image = None
        
        self.setup_music_library()
        self.setup_music_player()

    def add_resize_grip(self):
        sizegrip = ttk.Sizegrip(self.master)
        sizegrip.pack(side='right', anchor='se')

    def setup_ui(self):
        toolbar = ttk.Frame(self.master)
        toolbar.pack(side=tk.TOP, fill=tk.X, padx=10, pady=10)
        
        # Create a style for the buttons
        self.style.configure('TButton', font=('Helvetica', 10))
        
        # First row of buttons
        button_frame1 = ttk.Frame(toolbar)
        button_frame1.pack(fill=tk.X, pady=5)
        
        ttk.Button(button_frame1, text="Upload Map", command=self.upload_map, style='primary.TButton').pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame1, text="Add Token", command=self.add_token, style='primary.TButton').pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame1, text="Delete Token", command=self.delete_token, style='danger.TButton').pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame1, text="Fit to Screen", command=self.fit_to_screen, style='primary.TButton').pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame1, text="Save", command=self.save_map, style='primary.TButton').pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame1, text="Clear Map", command=self.clear_map, style='danger.TButton').pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame1, text="Toggle Library", command=self.toggle_library, style='info.TButton').pack(side=tk.LEFT, padx=5)
        
        # Second row with grid size slider and checkboxes
        control_frame = ttk.Frame(toolbar)
        control_frame.pack(fill=tk.X, pady=5)
        
        self.grid_size_slider = ttk.Scale(control_frame, from_=20, to=100, orient=tk.HORIZONTAL, command=self.update_grid_size)
        self.grid_size_slider.set(self.grid_size)
        self.grid_size_slider.pack(side=tk.LEFT, padx=5)
        ttk.Label(control_frame, text="Grid Size").pack(side=tk.LEFT, padx=5)
        self.always_on_top_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(control_frame, text="Always on Top", variable=self.always_on_top_var, command=self.toggle_always_on_top).pack(side=tk.LEFT, padx=5)
        
        # Add music control buttons
        ttk.Button(button_frame1, text="Play/Pause", command=self.toggle_music, style='info.TButton').pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame1, text="Next Track", command=self.next_track, style='info.TButton').pack(side=tk.LEFT, padx=5)
        
        # Add a new button for Token Creator
        ttk.Button(button_frame1, text="Token Creator", command=self.create_token, style='info.TButton').pack(side=tk.LEFT, padx=5)

    def setup_bindings(self):
        self.canvas.bind("<ButtonPress-1>", self.on_click)
        self.canvas.bind("<B1-Motion>", self.on_drag)
        self.canvas.bind("<ButtonRelease-1>", self.on_release)
        self.canvas.bind("<B3-Motion>", self.on_right_drag)
        self.canvas.bind("<ButtonPress-3>", self.on_right_click)
        self.canvas.bind("<ButtonRelease-3>", self.on_right_release)
        
    def on_click(self, event):
        self.start_x = self.canvas.canvasx(event.x)
        self.start_y = self.canvas.canvasy(event.y)
        self.clicked_token = self.canvas.find_withtag("current")
        
    def on_drag(self, event):
        if self.clicked_token and "token" in self.canvas.gettags(self.clicked_token):
            x = self.canvas.canvasx(event.x)
            y = self.canvas.canvasy(event.y)
            self.canvas.move(self.clicked_token, x - self.start_x, y - self.start_y)
            self.start_x = x
            self.start_y = y
            new_pos = self.canvas.coords(self.clicked_token)
            if new_pos:
                self.tokens[self.clicked_token[0]]["last_position"] = new_pos
        
    def on_release(self, event):
        self.clicked_token = None
        
    def toggle_image_lock(self):
        self.image_locked = self.lock_image_var.get()
        
    def toggle_grid_lock(self):
        self.grid_locked = self.lock_grid_var.get()
        
    def center_map(self):
        if hasattr(self, 'map_image'):
            canvas_width = self.canvas.winfo_width()
            canvas_height = self.canvas.winfo_height()
            image_width, image_height = self.map_image.size
            
            x_offset = max(0, (canvas_width - image_width) // 2)
            y_offset = max(0, (canvas_height - image_height) // 2)
            
            self.canvas.delete("all")
            self.tk_image = ImageTk.PhotoImage(self.map_image)
            self.canvas.create_image(x_offset, y_offset, anchor=tk.NW, image=self.tk_image, tags="map")
            
            if not self.grid_locked:
                self.draw_grid(x_offset, y_offset)
            
            self.redraw_tokens(x_offset, y_offset)
            
            self.canvas.config(scrollregion=(0, 0, canvas_width, canvas_height))

    def draw_grid(self, x_offset=0, y_offset=0):
        if hasattr(self, 'map_image'):
            width, height = self.map_image.size
            zoomed_width = int(width * self.zoom_factor)
            zoomed_height = int(height * self.zoom_factor)
            zoomed_grid_size = int(self.grid_size * self.zoom_factor)
            
            for x in range(x_offset, zoomed_width + x_offset, zoomed_grid_size):
                self.canvas.create_line(x, y_offset, x, zoomed_height + y_offset, fill="gray", tags="grid")
            for y in range(y_offset, zoomed_height + y_offset, zoomed_grid_size):
                self.canvas.create_line(x_offset, y, zoomed_width + x_offset, y, fill="gray", tags="grid")
                

    def delete_token(self):
        if self.clicked_token and "token" in self.canvas.gettags(self.clicked_token):
            self.canvas.delete(self.clicked_token)
            del self.tokens[self.clicked_token[0]]
            self.clicked_token = None


    def redraw_tokens(self, x_offset=0, y_offset=0):
        new_tokens = {}
        for token_id, token_data in self.tokens.items():
            coords = token_data.get("last_position", self.get_map_center())
            x, y = coords
            
            zoomed_x = int(x * self.zoom_factor) + x_offset
            zoomed_y = int(y * self.zoom_factor) + y_offset
            
            zoomed_size = int(self.grid_size * self.zoom_factor)
            token_image = Image.open(token_data["file_path"]).resize((zoomed_size, zoomed_size))
            token_tk_image = ImageTk.PhotoImage(token_image)
            new_id = self.canvas.create_image(zoomed_x, zoomed_y, image=token_tk_image, tags=("token",))
            new_tokens[new_id] = {
                "image": token_tk_image,
                "file_path": token_data["file_path"],
                "last_position": (x, y)
            }
        
        self.tokens = new_tokens

    def get_map_center(self):
        if hasattr(self, 'map_image'):
            width, height = self.map_image.size
            return width // 2, height // 2
        return 0, 0

    def upload_map(self, file_path=None):
        if file_path is None:
            file_path = filedialog.askopenfilename(filetypes=[("Image files", "*.png *.jpg *.jpeg")])
        if file_path:
            self.map_image = Image.open(file_path)
            self.original_map_image = self.map_image.copy()  # Store original image
            self.fit_to_screen()

    def fit_to_screen(self):
        if hasattr(self, 'map_image'):
            canvas_width = self.canvas.winfo_width()
            canvas_height = self.canvas.winfo_height()
            image_width, image_height = self.original_map_image.size
            
            width_ratio = canvas_width / image_width
            height_ratio = canvas_height / image_height
            scale = min(width_ratio, height_ratio)
            
            new_width = int(image_width * scale)
            new_height = int(image_height * scale)
            
            self.map_image = self.original_map_image.resize((new_width, new_height), Image.LANCZOS)
            self.zoom_factor = scale
            self.redraw()
            self.center_map()

    def add_token(self, file_path=None, x=None, y=None):
        if file_path is None:
            file_path = filedialog.askopenfilename(filetypes=[("Image files", "*.png *.jpg *.jpeg")])
        if file_path:
            if x is None or y is None:
                center_x, center_y = self.get_map_center()
            else:
                center_x, center_y = self.canvas.canvasx(x), self.canvas.canvasy(y)
            
            token_image = Image.open(file_path)
            token_tk_image = self.resize_token_image(token_image)
            token_id = self.canvas.create_image(center_x, center_y, image=token_tk_image, tags=("token",))
            self.tokens[token_id] = {"image": token_tk_image, "file_path": file_path, "last_position": (center_x, center_y)}
            self.canvas.tag_raise(token_id)

    def resize_token_image(self, image):
        token_size = int(self.grid_size * self.zoom_factor)
        resized_image = image.resize((token_size, token_size), Image.LANCZOS)
        return ImageTk.PhotoImage(resized_image)

    def calculate_range(self):
        messagebox.showinfo("Range Calculation", "Right-click and drag to measure distance.")
        
    def save_map(self):
        data = {
            "tokens": [(self.canvas.coords(id), self.tokens[id]["file_path"]) for id in self.tokens],
            "grid_size": self.grid_size
        }
        file_path = filedialog.asksaveasfilename(defaultextension=".json")
        if file_path:
            with open(file_path, "w") as f:
                json.dump(data, f)
            messagebox.showinfo("Save", "Map saved successfully!")

    def toggle_always_on_top(self):
        self.master.attributes('-topmost', self.always_on_top_var.get())

    def update_grid_size(self, value):
        self.grid_size = int(float(value))
        if hasattr(self, 'map_image'):
            self.redraw()  # Always redraw when grid size changes
        if self.tokens:  # Only resize tokens if there are any
            self.resize_all_tokens()

    def redraw(self):
        if hasattr(self, 'map_image'):
            self.canvas.delete("all")
            
            canvas_width = self.canvas.winfo_width()
            canvas_height = self.canvas.winfo_height()
            image_width, image_height = self.map_image.size
            
            x_offset = max(0, (canvas_width - image_width) // 2)
            y_offset = max(0, (canvas_height - image_height) // 2)
            
            self.tk_image = ImageTk.PhotoImage(self.map_image)
            self.canvas.create_image(x_offset, y_offset, anchor=tk.NW, image=self.tk_image, tags="map")
            
            if not self.grid_locked:
                self.draw_grid(x_offset, y_offset)
            
            self.redraw_tokens(x_offset, y_offset)
            
            self.canvas.config(scrollregion=(0, 0, canvas_width, canvas_height))

    def resize_all_tokens(self):
        if hasattr(self, 'canvas') and hasattr(self, 'map_image'):
            map_width, map_height = self.map_image.size
            canvas_width = self.canvas.winfo_width()
            canvas_height = self.canvas.winfo_height()
            
            x_offset = max(0, (canvas_width - map_width) // 2)
            y_offset = max(0, (canvas_height - map_height) // 2)
            
            for token_id, token_data in self.tokens.items():
                last_x, last_y = token_data["last_position"]
                
                # Calculate relative position
                rel_x = last_x / map_width
                rel_y = last_y / map_height
                
                # Calculate new position based on current map size
                new_x = int(rel_x * map_width) + x_offset
                new_y = int(rel_y * map_height) + y_offset
                
                token_image = Image.open(token_data["file_path"])
                token_tk_image = self.resize_token_image(token_image)
                self.tokens[token_id]["image"] = token_tk_image
                
                # Update token position and image
                self.canvas.coords(token_id, new_x, new_y)
                self.canvas.itemconfig(token_id, image=token_tk_image)
                
                # Update last_position
                self.tokens[token_id]["last_position"] = (new_x - x_offset, new_y - y_offset)
            
            self.canvas.update()
        else:
            print("Warning: Canvas or map image not initialized")

    def update_grid_size(self, value):
        self.grid_size = int(float(value))
        if hasattr(self, 'map_image'):
            self.redraw()  # Always redraw when grid size changes
        if self.tokens:  # Only resize tokens if there are any
            self.resize_all_tokens()

    def draw_grid(self, x_offset=0, y_offset=0):
        if hasattr(self, 'map_image'):
            width, height = self.map_image.size
            zoomed_grid_size = int(self.grid_size * self.zoom_factor)
            
            # Calculate the number of grid lines
            num_x_lines = width // zoomed_grid_size + 1
            num_y_lines = height // zoomed_grid_size + 1
            
            # Draw vertical lines
            for i in range(num_x_lines):
                x = i * zoomed_grid_size + x_offset
                self.canvas.create_line(x, y_offset, x, height + y_offset, fill="gray", tags="grid")
            
            # Draw horizontal lines
            for i in range(num_y_lines):
                y = i * zoomed_grid_size + y_offset
                self.canvas.create_line(x_offset, y, width + x_offset, y, fill="gray", tags="grid")

    def redraw_tokens(self, x_offset=0, y_offset=0):
        new_tokens = {}
        if hasattr(self, 'map_image'):
            map_width, map_height = self.map_image.size
            for token_id, token_data in self.tokens.items():
                last_x, last_y = token_data.get("last_position", self.get_map_center())
                
                # Calculate relative position
                rel_x, rel_y = self.calculate_relative_position(last_x, last_y, map_width, map_height)
                
                # Calculate new position based on current map size
                new_x = int(rel_x * map_width)
                new_y = int(rel_y * map_height)
                
                zoomed_x = int(new_x * self.zoom_factor) + x_offset
                zoomed_y = int(new_y * self.zoom_factor) + y_offset
                
                token_image = Image.open(token_data["file_path"])
                token_tk_image = self.resize_token_image(token_image)
                new_id = self.canvas.create_image(zoomed_x, zoomed_y, image=token_tk_image, tags=("token",))
                new_tokens[new_id] = {
                    "image": token_tk_image,
                    "file_path": token_data["file_path"],
                    "last_position": (new_x, new_y)
                }
        
        self.tokens = new_tokens

    def calculate_relative_position(self, x, y, width, height):
        rel_x = x / width if width > 0 else 0
        rel_y = y / height if height > 0 else 0
        return rel_x, rel_y

    def on_right_click(self, event):
        self.range_start = (self.canvas.canvasx(event.x), self.canvas.canvasy(event.y))
        self.remove_range_elements()

    def on_right_drag(self, event):
        if self.range_start:
            end = (self.canvas.canvasx(event.x), self.canvas.canvasy(event.y))
            self.draw_range_line(self.range_start, end)

    def on_right_release(self, event):
        self.range_start = None

    def draw_range_line(self, start, end):
        self.remove_range_elements()
        self.range_line = self.canvas.create_line(start[0], start[1], end[0], end[1], fill="red", width=2, tags="range")
        
        dx = (end[0] - start[0]) / (self.grid_size * self.zoom_factor)
        dy = (end[1] - start[1]) / (self.grid_size * self.zoom_factor)
        distance_squares = ((dx ** 2 + dy ** 2) ** 0.5)
        distance_feet = round(distance_squares * 5, 1)  # 1 square = 5 feet
        
        midx = (start[0] + end[0]) / 2
        midy = (start[1] + end[1]) / 2
        self.range_text = self.canvas.create_text(midx, midy, text=f"{distance_feet} feet", fill="red", font=("Arial", 12, "bold"), tags="range")

    def remove_range_elements(self):
        if self.range_line:
            self.canvas.delete(self.range_line)
        if self.range_text:
            self.canvas.delete(self.range_text)

    def create_notes_window(self):
        self.notes_frame = ttk.Frame(self.main_frame, width=200)
        self.notes_frame.pack(side=tk.RIGHT, fill=tk.Y)
        
        self.notes_label = ttk.Label(self.notes_frame, text="Notes", font=("Arial", 14, "bold"))
        self.notes_label.pack(pady=10)
        
        self.notes_text = tk.Text(self.notes_frame, wrap=tk.WORD, width=25, height=20)
        self.notes_text.pack(padx=5, pady=5)
        
        notes = [
           "To Start, Upload a Map and Tokens into the Library",
           "Click on the map and select use this map to set the map",
           "Click on the tokens and select use this token to set the token",
           "Click on the grid size to set the grid size",
        ]
        
        for note in notes:
            self.notes_text.insert(tk.END, note + "\n\n")
        
        self.notes_text.config(state=tk.DISABLED)

    def setup_library(self):
        self.library_frame = ttk.Frame(self.main_frame, width=200)
        
        self.library_notebook = ttk.Notebook(self.library_frame)
        self.library_notebook.pack(fill=tk.BOTH, expand=True)
        
        self.maps_frame = ttk.Frame(self.library_notebook)
        self.tokens_frame = ttk.Frame(self.library_notebook)
        self.music_frame = ttk.Frame(self.library_notebook)
        
        self.library_notebook.add(self.maps_frame, text='Maps')
        self.library_notebook.add(self.tokens_frame, text='Tokens')
        self.library_notebook.add(self.music_frame, text='Music')
        
        ttk.Button(self.maps_frame, text="Upload Map", command=self.upload_to_library).pack()
        ttk.Button(self.tokens_frame, text="Upload Token", command=self.upload_to_library).pack()
        ttk.Button(self.music_frame, text="Add Music", command=self.add_music_to_library).pack()
        
        self.maps_listbox = tk.Listbox(self.maps_frame, selectmode=tk.SINGLE)
        self.maps_listbox.pack(fill=tk.BOTH, expand=True)
        self.maps_listbox.bind('<ButtonPress-1>', self.on_library_item_click)
        
        self.tokens_listbox = tk.Listbox(self.tokens_frame, selectmode=tk.SINGLE)
        self.tokens_listbox.pack(fill=tk.BOTH, expand=True)
        self.tokens_listbox.bind('<ButtonPress-1>', self.on_library_item_click)
        
        self.music_listbox = tk.Listbox(self.music_frame, selectmode=tk.SINGLE)
        self.music_listbox.pack(fill=tk.BOTH, expand=True)
        self.music_listbox.bind('<Double-1>', self.on_music_double_click)

    def toggle_library(self):
        if self.library_visible:
            self.library_frame.pack_forget()
            self.library_visible = False
        else:
            self.library_frame.pack(side=tk.RIGHT, fill=tk.Y)
            self.library_visible = True

    def upload_to_library(self):
        file_path = filedialog.askopenfilename(filetypes=[("Image files", "*.png *.jpg *.jpeg")])
        if file_path:
            file_name = os.path.basename(file_path)
            if self.library_notebook.index(self.library_notebook.select()) == 0:
                destination = os.path.join("library", "maps", file_name)
                self.library_data["maps"].append(destination)
                self.maps_listbox.insert(tk.END, file_name)
            else:
                destination = os.path.join("library", "tokens", file_name)
                self.library_data["tokens"].append(destination)
                self.tokens_listbox.insert(tk.END, file_name)
            
            os.makedirs(os.path.dirname(destination), exist_ok=True)
            shutil.copy2(file_path, destination)
        
        self.save_library_data()
        
        # Ensure the Map Editor window stays on top after file dialog
        self.master.lift()
        self.master.focus_force()

    def on_library_item_click(self, event):
        widget = event.widget
        index = widget.nearest(event.y)
        item = widget.get(index)
        
        if widget == self.maps_listbox:
            item_path = os.path.join("library", "maps", item)
            self.preview_item(item_path, is_map=True)
        elif widget == self.tokens_listbox:
            item_path = os.path.join("library", "tokens", item)
            self.preview_item(item_path, is_map=False)

    def preview_item(self, file_path, is_map):
        preview_image = Image.open(file_path)
        preview_image.thumbnail((300, 300))  # Resize for preview
        self.preview_tk_image = ImageTk.PhotoImage(preview_image)
        
        self.preview_window = tk.Toplevel(self.master)
        self.preview_window.title("Preview")
        ttk.Label(self.preview_window, image=self.preview_tk_image).pack()
        
        if is_map:
            ttk.Button(self.preview_window, text="Use This Map", command=lambda: self.use_map(file_path)).pack()
        else:
            ttk.Button(self.preview_window, text="Use This Token", command=lambda: self.use_token(file_path)).pack()

    def use_map(self, file_path):
        self.upload_map(file_path)
        self.preview_window.destroy()

    def use_token(self, file_path):
        center_x, center_y = self.get_map_center()
        self.add_token(file_path, center_x, center_y)
        self.preview_window.destroy()

    def clear_map(self):
        self.canvas.delete("all")
        self.tokens.clear()
        if hasattr(self, 'map_image'):
            delattr(self, 'map_image')
        self.redraw()

    def save_library_data(self):
        with open("library_data.json", "w") as f:
            json.dump(self.library_data, f)

    def load_library_data(self):
        try:
            with open("library_data.json", "r") as f:
                library_data = json.load(f)
            
            self.library_data = library_data
            
            for map_path in self.library_data.get("maps", []):
                self.maps_listbox.insert(tk.END, os.path.basename(map_path))
            
            for token_path in self.library_data.get("tokens", []):
                self.tokens_listbox.insert(tk.END, os.path.basename(token_path))
            
            for music_path in self.library_data.get("music", []):
                self.music_listbox.insert(tk.END, os.path.basename(music_path))
        except FileNotFoundError:
            self.library_data = {"maps": [], "tokens": [], "music": []}  # Initialize with empty lists if file not found
        except json.JSONDecodeError:
            print("Error decoding JSON. The library_data.json file may be corrupted.")
            self.library_data = {"maps": [], "tokens": [], "music": []}  # Initialize with empty lists on error

    def setup_music_library(self):
        self.music_library = []
        if "music" not in self.library_data:
            self.library_data["music"] = []

    def setup_music_player(self):
        pygame.mixer.init()
        self.current_track = None
        self.is_playing = False

    def add_music_to_library(self):
        file_path = filedialog.askopenfilename(filetypes=[("Audio files", "*.mp3 *.wav *.ogg")])
        if file_path:
            file_name = os.path.basename(file_path)
            destination = os.path.join("library", "music", file_name)
            
            os.makedirs(os.path.dirname(destination), exist_ok=True)
            shutil.copy2(file_path, destination)
            
            self.library_data["music"].append(destination)
            self.music_listbox.insert(tk.END, file_name)
            self.save_library_data()

    def on_music_double_click(self, event):
        selection = self.music_listbox.curselection()
        if selection:
            index = selection[0]
            self.play_music(index)

    def play_music(self, index):
        if 0 <= index < len(self.library_data["music"]):
            self.current_track = self.library_data["music"][index]
            pygame.mixer.music.load(self.current_track)
            pygame.mixer.music.play()
            self.is_playing = True

    def toggle_music(self):
        if self.is_playing:
            pygame.mixer.music.pause()
            self.is_playing = False
        else:
            pygame.mixer.music.unpause()
            self.is_playing = True

    def next_track(self):
        if self.current_track:
            current_index = self.library_data["music"].index(self.current_track)
            next_index = (current_index + 1) % len(self.library_data["music"])
            self.play_music(next_index)

    def create_token(self):
        self.token_creator_window = tk.Toplevel(self.master)
        self.token_creator_window.title("Token Creator")
        self.token_creator_window.geometry("400x600")

        self.token_image = None
        self.token_photo = None

        ttk.Button(self.token_creator_window, text="Upload Image", command=self.upload_token_image).pack(pady=10)

        self.token_canvas = tk.Canvas(self.token_creator_window, width=300, height=300, bg="lightgray")
        self.token_canvas.pack(pady=10)

        self.token_size_var = tk.IntVar(value=self.grid_size)
        ttk.Label(self.token_creator_window, text="Token Size:").pack()
        ttk.Scale(self.token_creator_window, from_=20, to=100, orient=tk.HORIZONTAL, variable=self.token_size_var, command=self.update_token_preview).pack()

        self.border_color_var = tk.StringVar(value="black")
        ttk.Label(self.token_creator_window, text="Border Color:").pack(pady=(10, 0))
        ttk.Combobox(self.token_creator_window, textvariable=self.border_color_var, values=["black", "white", "red", "green", "blue", "yellow"], state="readonly").pack()
        self.border_color_var.trace("w", self.update_token_preview)

        self.border_width_var = tk.IntVar(value=2)
        ttk.Label(self.token_creator_window, text="Border Width:").pack(pady=(10, 0))
        ttk.Scale(self.token_creator_window, from_=0, to=10, orient=tk.HORIZONTAL, variable=self.border_width_var, command=self.update_token_preview).pack()

        ttk.Button(self.token_creator_window, text="Create Token", command=self.finalize_token).pack(pady=10)

    def upload_token_image(self):
        file_path = filedialog.askopenfilename(filetypes=[("Image files", "*.png *.jpg *.jpeg")])
        if file_path:
            self.token_image = Image.open(file_path)
            self.update_token_preview()

    def update_token_preview(self, *args):
        if self.token_image:
            size = self.token_size_var.get()
            border_color = self.border_color_var.get()
            border_width = self.border_width_var.get()
            preview = self.create_round_token(self.token_image, size, border_color, border_width)
            self.token_photo = ImageTk.PhotoImage(preview)
            self.token_canvas.delete("all")
            self.token_canvas.create_image(150, 150, image=self.token_photo)

    def create_round_token(self, image, size, border_color, border_width):
        # Create a square image with a transparent background
        image = image.copy()
        image.thumbnail((size, size))
        square_img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        
        # Paste the original image centered
        paste_x = (size - image.width) // 2
        paste_y = (size - image.height) // 2
        square_img.paste(image, (paste_x, paste_y))
        
        # Create a circular mask
        mask = Image.new('L', (size, size), 0)
        draw = ImageDraw.Draw(mask)
        draw.ellipse((0, 0, size, size), fill=255)
        
        # Apply the mask to create a circular image
        output = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        output.paste(square_img, (0, 0), mask)
        
        # Add border
        if border_width > 0:
            draw = ImageDraw.Draw(output)
            draw.ellipse((0, 0, size, size), outline=border_color, width=border_width)
        
        return output
    
    def finalize_token(self):
        if self.token_image:
            size = self.token_size_var.get()
            border_color = self.border_color_var.get()
            border_width = self.border_width_var.get()
            final_token = self.create_round_token(self.token_image, size, border_color, border_width)
            
            # Save the token
            file_path = filedialog.asksaveasfilename(defaultextension=".png", filetypes=[("PNG files", "*.png")])
            if file_path:
                final_token.save(file_path)
                
                # Add the token to the library
                destination = os.path.join("library", "tokens", os.path.basename(file_path))
                os.makedirs(os.path.dirname(destination), exist_ok=True)
                shutil.copy2(file_path, destination)
                self.library_data["tokens"].append(destination)
                self.tokens_listbox.insert(tk.END, os.path.basename(file_path))
                self.save_library_data()
                
                messagebox.showinfo("Success", "Token created and added to the library!")
                self.token_creator_window.destroy()

    def open_gm_map():
        gm_window = tk.Toplevel()
        map_editor = MapEditor(gm_window)
        
        # Release the grab when the Map Editor window is closed
        gm_window.protocol("WM_DELETE_WINDOW", lambda: [map_editor.save_library_data(), gm_window.grab_release(), gm_window.destroy()])

if __name__ == "__main__":
    root = tk.Tk()
    root.geometry("1000x600")
    
    # Ensure the window has all control buttons
    root.overrideredirect(False)
    root.resizable(True, True)
    
    root.mainloop()