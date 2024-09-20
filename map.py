import tkinter as tk
from tkinter import filedialog, messagebox, ttk, simpledialog
from PIL import Image, ImageTk, ImageDraw
import json
import os
import shutil
import ttkbootstrap as ttk
from ttkbootstrap.constants import *
import pygame
import mutagen

class MapEditor:
    def __init__(self, master):
        self.master = master
        self.master.title("GM Map")
        self.style = ttk.Style(theme='darkly')
        
        self.setup_variables()
        self.setup_ui()
        self.setup_bindings()
        self.load_library_data()
        self.setup_music_player()
        self.setup_tooltips()

    def setup_variables(self):
        self.grid_size = 50
        self.tokens = {}
        self.image_locked = False
        self.grid_locked = False
        self.map_locked = False
        self.zoom_factor = 1.0
        self.range_start = None
        self.range_line = None
        self.range_text = None
        self.library_visible = False
        self.library_data = {"maps": [], "tokens": [], "music": []}
        self.dragging = False
        self.drag_item = None
        self.drag_token = None
        self.drag_token_image = None
        self.selected_token = None
        self.token_rotation = {}
        self.grid_visible = True
        self.current_tokens = {}

    def setup_ui(self):
        self.master.columnconfigure(0, weight=1)
        self.master.rowconfigure(1, weight=1)

        self.setup_toolbar()
        self.setup_main_area()
        self.setup_sidebar()

    def setup_toolbar(self):
        toolbar = ttk.Frame(self.master, padding="10 5 10 5")
        toolbar.grid(row=0, column=0, columnspan=2, sticky="ew")

        ttk.Button(toolbar, text="Upload Map", command=self.upload_map, style='primary.TButton').pack(side=LEFT, padx=2)
        ttk.Button(toolbar, text="Add Token", command=self.add_token, style='primary.TButton').pack(side=LEFT, padx=2)
        ttk.Button(toolbar, text="Fit to Screen", command=self.fit_to_screen, style='primary.TButton').pack(side=LEFT, padx=2)
        ttk.Button(toolbar, text="Clear Map", command=self.clear_map, style='danger.TButton').pack(side=LEFT, padx=2)
        ttk.Button(toolbar, text="Rotate Token", command=self.rotate_selected_token, style='primary.TButton').pack(side=LEFT, padx=2)
        
        self.grid_size_var = tk.IntVar(value=self.grid_size)
        ttk.Label(toolbar, text="Grid Size:").pack(side=LEFT, padx=(10, 2))
        ttk.Scale(toolbar, from_=20, to=100, variable=self.grid_size_var, command=self.update_grid_size).pack(side=LEFT, padx=2)
        
        self.always_on_top_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(toolbar, text="Always on Top", variable=self.always_on_top_var, command=self.toggle_always_on_top).pack(side=RIGHT, padx=2)
        
        # Add the Toggle Grid button
        self.toggle_grid_var = tk.BooleanVar(value=self.grid_visible)
        ttk.Checkbutton(toolbar, text="Show Grid", variable=self.toggle_grid_var, command=self.toggle_grid).pack(side=LEFT, padx=2)

    def setup_main_area(self):
        main_frame = ttk.Frame(self.master)
        main_frame.grid(row=1, column=0, sticky="nsew")
        main_frame.columnconfigure(0, weight=1)
        main_frame.rowconfigure(0, weight=1)

        self.canvas = tk.Canvas(main_frame, bg='white')
        self.canvas.grid(row=0, column=0, sticky="nsew")

        x_scrollbar = ttk.Scrollbar(main_frame, orient=HORIZONTAL, command=self.canvas.xview)
        x_scrollbar.grid(row=1, column=0, sticky="ew")
        y_scrollbar = ttk.Scrollbar(main_frame, orient=VERTICAL, command=self.canvas.yview)
        y_scrollbar.grid(row=0, column=1, sticky="ns")

        self.canvas.configure(xscrollcommand=x_scrollbar.set, yscrollcommand=y_scrollbar.set)

    def setup_sidebar(self):
        sidebar = ttk.Notebook(self.master)
        sidebar.grid(row=1, column=1, sticky="ns")

        self.setup_library_tab(sidebar)
        self.setup_notes_tab(sidebar)
        self.setup_music_tab(sidebar)
        self.setup_current_tokens_tab(sidebar)

    def setup_library_tab(self, parent):
        library_frame = ttk.Frame(parent)
        parent.add(library_frame, text="Library")

        ttk.Button(library_frame, text="Upload Map", command=lambda: self.upload_to_library("maps")).pack(fill=X, padx=5, pady=2)
        ttk.Button(library_frame, text="Upload Token", command=lambda: self.upload_to_library("tokens")).pack(fill=X, padx=5, pady=2)

        self.maps_listbox = tk.Listbox(library_frame, selectmode=SINGLE)
        self.maps_listbox.pack(fill=BOTH, expand=True, padx=5, pady=2)
        self.maps_listbox.bind('<Double-1>', lambda e: self.use_library_item("maps"))

        self.tokens_listbox = tk.Listbox(library_frame, selectmode=SINGLE)
        self.tokens_listbox.pack(fill=BOTH, expand=True, padx=5, pady=2)
        self.tokens_listbox.bind('<Double-1>', lambda e: self.use_library_item("tokens"))

    def setup_notes_tab(self, parent):
        notes_frame = ttk.Frame(parent)
        parent.add(notes_frame, text="Notes")

        self.notes_text = tk.Text(notes_frame, wrap=WORD, width=25, height=20)
        self.notes_text.pack(fill=BOTH, expand=True, padx=5, pady=5)

        notes = [
            "To Start, Upload a Map and Tokens into the Library",
            "Double-click on a map in the library to set it as the current map",
            "Double-click on a token in the library to add it to the map",
            "Adjust the grid size using the slider in the toolbar",
        ]

        for note in notes:
            self.notes_text.insert(END, note + "\n\n")
        self.notes_text.config(state=DISABLED)

    def setup_music_tab(self, parent):
        music_frame = ttk.Frame(parent)
        parent.add(music_frame, text="Music")

        ttk.Button(music_frame, text="Add Music", command=self.add_music_to_library).pack(fill=X, padx=5, pady=2)
        
        self.music_listbox = tk.Listbox(music_frame, selectmode=SINGLE)
        self.music_listbox.pack(fill=BOTH, expand=True, padx=5, pady=2)
        self.music_listbox.bind('<Double-1>', self.on_music_double_click)

        controls_frame = ttk.Frame(music_frame)
        controls_frame.pack(fill=X, padx=5, pady=2)

        ttk.Button(controls_frame, text="Play/Pause", command=self.toggle_music).pack(side=LEFT, padx=2)
        ttk.Button(controls_frame, text="Next Track", command=self.next_track).pack(side=LEFT, padx=2)

    def setup_current_tokens_tab(self, parent):
        current_tokens_frame = ttk.Frame(parent)
        parent.add(current_tokens_frame, text="Current Tokens")

        self.current_tokens_listbox = tk.Listbox(current_tokens_frame, selectmode=SINGLE)
        self.current_tokens_listbox.pack(fill=BOTH, expand=True, padx=5, pady=2)

        buttons_frame = ttk.Frame(current_tokens_frame)
        buttons_frame.pack(fill=X, padx=5, pady=2)

        ttk.Button(buttons_frame, text="Blink Token", command=self.blink_selected_token).pack(side=LEFT, padx=2)
        ttk.Button(buttons_frame, text="Edit Token", command=self.edit_selected_token).pack(side=LEFT, padx=2)
        ttk.Button(buttons_frame, text="Delete Token", command=self.delete_selected_token).pack(side=LEFT, padx=2)

    def setup_tooltips(self):
        self.tooltip = None

    def setup_bindings(self):
        self.canvas.bind("<ButtonPress-1>", self.on_click)
        self.canvas.bind("<B1-Motion>", self.on_drag)
        self.canvas.bind("<ButtonRelease-1>", self.on_release)
        self.canvas.bind("<ButtonPress-3>", self.on_right_click)
        self.canvas.bind("<B3-Motion>", self.on_right_drag)
        self.canvas.bind("<ButtonRelease-3>", self.on_right_release)
        self.canvas.bind("<KeyPress-r>", lambda event: self.rotate_selected_token())

    def upload_map(self, file_path=None):
        if file_path is None:
            file_path = filedialog.askopenfilename(filetypes=[("Image files", "*.png *.jpg *.jpeg")])
        if file_path:
            self.map_image = Image.open(file_path)
            self.original_map_image = self.map_image.copy()
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
            
            # Prompt for token name
            token_name = self.prompt_token_name()
            
            token_image = Image.open(file_path)
            token_tk_image = self.resize_token_image(token_image)
            token_id = self.canvas.create_image(center_x, center_y, image=token_tk_image, tags=("token",))
            self.tokens[token_id] = {
                "image": token_tk_image,
                "file_path": file_path,
                "last_position": (center_x, center_y),
                "name": token_name
            }
            self.token_rotation[token_id] = 0
            self.canvas.tag_raise(token_id)
            
            # Add token to current tokens list
            self.current_tokens[token_id] = token_name
            self.current_tokens_listbox.insert(tk.END, token_name)

            # Bind mouse events for tooltip
            self.canvas.tag_bind(token_id, "<Enter>", lambda e, tid=token_id: self.show_token_tooltip(e, tid))
            self.canvas.tag_bind(token_id, "<Leave>", self.hide_token_tooltip)

    def prompt_token_name(self):
        name = simpledialog.askstring("Token Name", "Enter a name for this token:")
        return name if name else ""

    def resize_token_image(self, image):
        token_size = int(self.grid_size * self.zoom_factor)
        resized_image = image.resize((token_size, token_size), Image.LANCZOS)
        return ImageTk.PhotoImage(resized_image)

    def calculate_range(self):
        messagebox.showinfo("Range Calculation", "Right-click and drag to measure distance.")
        
    def save_map(self):
        data = {
            "tokens": [(self.canvas.coords(id), self.tokens[id]["file_path"], self.token_rotation.get(id, 0)) for id in self.tokens],
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
            self.redraw()
        if self.tokens:
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
                
                rel_x = last_x / map_width
                rel_y = last_y / map_height
                
                new_x = int(rel_x * map_width) + x_offset
                new_y = int(rel_y * map_height) + y_offset
                
                token_image = Image.open(token_data["file_path"])
                token_tk_image = self.resize_token_image(token_image)
                self.tokens[token_id]["image"] = token_tk_image
                
                self.canvas.coords(token_id, new_x, new_y)
                self.canvas.itemconfig(token_id, image=token_tk_image)
                
                self.tokens[token_id]["last_position"] = (new_x - x_offset, new_y - y_offset)
            
            self.canvas.update()
        else:
            print("Warning: Canvas or map image not initialized")

    def draw_grid(self, x_offset=0, y_offset=0):
        if self.grid_visible and hasattr(self, 'map_image'):
            width, height = self.map_image.size
            zoomed_grid_size = int(self.grid_size * self.zoom_factor)
            
            num_x_lines = width // zoomed_grid_size + 1
            num_y_lines = height // zoomed_grid_size + 1
            
            for i in range(num_x_lines):
                x = i * zoomed_grid_size + x_offset
                self.canvas.create_line(x, y_offset, x, height + y_offset, fill="gray", tags="grid")
            
            for i in range(num_y_lines):
                y = i * zoomed_grid_size + y_offset
                self.canvas.create_line(x_offset, y, width + x_offset, y, fill="gray", tags="grid")

    def redraw_tokens(self, x_offset=0, y_offset=0):
        new_tokens = {}
        if hasattr(self, 'map_image'):
            map_width, map_height = self.map_image.size
            for token_id, token_data in self.tokens.items():
                last_x, last_y = token_data.get("last_position", self.get_map_center())
                
                rel_x, rel_y = self.calculate_relative_position(last_x, last_y, map_width, map_height)
                
                new_x = int(rel_x * map_width)
                new_y = int(rel_y * map_height)
                
                zoomed_x = int(new_x * self.zoom_factor) + x_offset
                zoomed_y = int(new_y * self.zoom_factor) + y_offset
                
                token_image = Image.open(token_data["file_path"])
                rotation = self.token_rotation.get(token_id, 0)
                if rotation != 0:
                    token_image = token_image.rotate(-rotation, resample=Image.BICUBIC, expand=True)
                token_tk_image = self.resize_token_image(token_image)
                new_id = self.canvas.create_image(zoomed_x, zoomed_y, image=token_tk_image, tags=("token",))
                new_tokens[new_id] = {
                    "image": token_tk_image,
                    "file_path": token_data["file_path"],
                    "last_position": (new_x, new_y),
                    "name": token_data.get("name", "")
                }
                self.token_rotation[new_id] = rotation
                
                # Redraw token name
                if token_data.get("name"):
                    text_id = self.canvas.create_text(zoomed_x, zoomed_y + int(self.grid_size * self.zoom_factor) // 2,
                                                      text=token_data["name"], fill="white", tags=("token_name",))
                    new_tokens[new_id]["name_id"] = text_id
        
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
        distance_feet = round(distance_squares * 5, 1)
        
        midx = (start[0] + end[0]) / 2
        midy = (start[1] + end[1]) / 2
        self.range_text = self.canvas.create_text(midx, midy, text=f"{distance_feet} feet", fill="red", font=("Arial", 12, "bold"), tags="range")

    def remove_range_elements(self):
        if self.range_line:
            self.canvas.delete(self.range_line)
        if self.range_text:
            self.canvas.delete(self.range_text)

    def upload_to_library(self, category):
        file_path = filedialog.askopenfilename(filetypes=[("Image files", "*.png *.jpg *.jpeg")])
        if file_path:
            file_name = os.path.basename(file_path)
            destination = os.path.join("library", category, file_name)
            
            os.makedirs(os.path.dirname(destination), exist_ok=True)
            shutil.copy2(file_path, destination)
            
            self.library_data[category].append(destination)
            if category == "maps":
                self.maps_listbox.insert(END, file_name)
            elif category == "tokens":
                self.tokens_listbox.insert(END, file_name)
            
            self.save_library_data()

    def use_library_item(self, category):
        if category == "maps":
            selection = self.maps_listbox.curselection()
            if selection:
                index = selection[0]
                file_path = self.library_data["maps"][index]
                self.upload_map(file_path)
        elif category == "tokens":
            selection = self.tokens_listbox.curselection()
            if selection:
                index = selection[0]
                file_path = self.library_data["tokens"][index]
                center_x, center_y = self.get_map_center()
                self.add_token(file_path, center_x, center_y)

    def setup_music_player(self):
        pygame.mixer.init()
        self.music_queue = []
        self.current_track = None
        self.playing = False

    def add_music_to_library(self):
        file_path = filedialog.askopenfilename(filetypes=[("Audio files", "*.mp3 *.wav")])
        if file_path:
            file_name = os.path.basename(file_path)
            destination = os.path.join("library", "music", file_name)
            
            os.makedirs(os.path.dirname(destination), exist_ok=True)
            shutil.copy2(file_path, destination)
            
            self.library_data["music"].append(destination)
            self.music_listbox.insert(END, file_name)
            
            self.save_library_data()

    def on_music_double_click(self, event):
        selection = self.music_listbox.curselection()
        if selection:
            index = selection[0]
            file_path = self.library_data["music"][index]
            self.play_music(file_path)

    def play_music(self, file_path):
        if self.current_track == file_path:
            if self.playing:
                pygame.mixer.music.pause()
                self.playing = False
            else:
                pygame.mixer.music.unpause()
                self.playing = True
        else:
            pygame.mixer.music.load(file_path)
            pygame.mixer.music.play()
            self.current_track = file_path
            self.playing = True

    def toggle_music(self):
        if self.current_track:
            if self.playing:
                pygame.mixer.music.pause()
                self.playing = False
            else:
                pygame.mixer.music.unpause()
                self.playing = True

    def next_track(self):
        if self.library_data["music"]:
            if self.current_track:
                current_index = self.library_data["music"].index(self.current_track)
                next_index = (current_index + 1) % len(self.library_data["music"])
            else:
                next_index = 0
            next_track = self.library_data["music"][next_index]
            self.play_music(next_track)

    def load_library_data(self):
        if os.path.exists("library_data.json"):
            with open("library_data.json", "r") as f:
                self.library_data = json.load(f)
            
            for category, items in self.library_data.items():
                if category == "maps":
                    for item in items:
                        self.maps_listbox.insert(END, os.path.basename(item))
                elif category == "tokens":
                    for item in items:
                        self.tokens_listbox.insert(END, os.path.basename(item))
                elif category == "music":
                    for item in items:
                        self.music_listbox.insert(END, os.path.basename(item))

    def save_library_data(self):
        with open("library_data.json", "w") as f:
            json.dump(self.library_data, f)

    def get_map_center(self):
        if hasattr(self, 'map_image'):
            width, height = self.map_image.size
            return width // 2, height // 2
        return 0, 0

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

    def on_click(self, event):
        self.start_x = self.canvas.canvasx(event.x)
        self.start_y = self.canvas.canvasy(event.y)
        self.clicked_token = self.canvas.find_withtag("current")
        if self.clicked_token and "token" in self.canvas.gettags(self.clicked_token):
            self.selected_token = self.clicked_token[0]
        else:
            self.selected_token = None
        
    def on_drag(self, event):
        if self.clicked_token and "token" in self.canvas.gettags(self.clicked_token):
            x = self.canvas.canvasx(event.x)
            y = self.canvas.canvasy(event.y)
            dx = x - self.start_x
            dy = y - self.start_y
            self.canvas.move(self.clicked_token, dx, dy)
            
            # Move the token name text along with the token
            token_data = self.tokens.get(self.clicked_token[0])
            if token_data and "name_id" in token_data:
                self.canvas.move(token_data["name_id"], dx, dy)
            
            self.start_x = x
            self.start_y = y
            new_pos = self.canvas.coords(self.clicked_token)
            if new_pos:
                self.tokens[self.clicked_token[0]]["last_position"] = new_pos
        
    def on_release(self, event):
        self.clicked_token = None
        
    def toggle_image_lock(self):
        self.image_locked = self.lock_image_var.get()
        
    def toggle_grid(self):
        self.grid_visible = self.toggle_grid_var.get()
        self.redraw()
        
    def delete_token(self):
        if self.clicked_token and "token" in self.canvas.gettags(self.clicked_token):
            self.canvas.delete(self.clicked_token)
            del self.tokens[self.clicked_token[0]]
            self.clicked_token = None

    def delete_selected_token(self):
        selection = self.current_tokens_listbox.curselection()
        if selection:
            index = selection[0]
            token_name = self.current_tokens_listbox.get(index)
            
            # Find the correct token_id
            token_id = None
            for tid, name in self.current_tokens.items():
                if name == token_name:
                    token_id = tid
                    break
            
            if token_id is not None and token_id in self.tokens:
                # Remove from canvas
                self.canvas.delete(token_id)
                name_id = self.tokens[token_id].get("name_id")
                if name_id:
                    self.canvas.delete(name_id)
                
                # Remove from data structures
                del self.tokens[token_id]
                del self.current_tokens[token_id]
                
                # Remove from listbox
                self.current_tokens_listbox.delete(index)

    def clear_map(self):
        self.canvas.delete("token")
        self.tokens = {}

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

    def show_token_tooltip(self, event, token_id):
        token_name = self.tokens[token_id]["name"]
        x, y = self.canvas.canvasx(event.x), self.canvas.canvasy(event.y)
        self.tooltip = self.canvas.create_text(x, y - 20, text=token_name, fill="white", font=("Arial", 12), tags="tooltip")

    def hide_token_tooltip(self, event):
        if self.tooltip:
            self.canvas.delete(self.tooltip)
            self.tooltip = None

    def blink_selected_token(self):
        selection = self.current_tokens_listbox.curselection()
        if selection:
            index = selection[0]
            token_name = self.current_tokens_listbox.get(index)
            token_id = next(tid for tid, name in self.current_tokens.items() if name == token_name)
            self.blink_token(token_id)

    def blink_token(self, token_id):
        blink_count = 0
        def toggle_visibility():
            nonlocal blink_count
            if blink_count < 10:  # 5 seconds at 2 blinks per second
                current_state = self.canvas.itemcget(token_id, 'state')
                new_state = 'hidden' if current_state == 'normal' else 'normal'
                self.canvas.itemconfigure(token_id, state=new_state)
                blink_count += 1
                self.master.after(250, toggle_visibility)  # 250ms for 2 blinks per second
            else:
                self.canvas.itemconfigure(token_id, state='normal')  # Ensure token is visible at the end

        toggle_visibility()

    def create_round_token(self, image, size, border_color, border_width):
        # Calculate the indicator size and extra padding needed
        indicator_size = max(5, size // 10)
        extra_padding = indicator_size + border_width

        # Create a larger square image with a transparent background
        total_size = size + 2 * extra_padding
        square_img = Image.new('RGBA', (total_size, total_size), (0, 0, 0, 0))
        
        # Resize and paste the original image centered
        image = image.copy()
        image.thumbnail((size, size))
        paste_x = (total_size - image.width) // 2
        paste_y = (total_size - image.height) // 2 + extra_padding  # Move down to make room for indicator
        square_img.paste(image, (paste_x, paste_y))
        
        # Create a circular mask for the entire image
        mask = Image.new('L', (total_size, total_size), 0)
        draw = ImageDraw.Draw(mask)
        draw.ellipse((extra_padding, extra_padding, total_size - extra_padding, total_size - extra_padding), fill=255)
        
        # Apply the mask to create a circular image
        output = Image.new('RGBA', (total_size, total_size), (0, 0, 0, 0))
        output.paste(square_img, (0, 0), mask)
        
        # Add border
        if border_width > 0:
            draw = ImageDraw.Draw(output)
            draw.ellipse((extra_padding, extra_padding, total_size - extra_padding, total_size - extra_padding), 
                         outline=border_color, width=border_width)
        
        # Add direction indicator (triangle) outside the circle
        draw = ImageDraw.Draw(output)
        draw.polygon([
            (total_size // 2, extra_padding - indicator_size),
            (total_size // 2 - indicator_size, extra_padding),
            (total_size // 2 + indicator_size, extra_padding)
        ], fill=border_color)
        
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

    def rotate_selected_token(self):
        if self.selected_token:
            current_rotation = self.token_rotation.get(self.selected_token, 0)
            new_rotation = (current_rotation + 45) % 360  # Rotate by 45 degrees
            self.token_rotation[self.selected_token] = new_rotation
            self.rotate_token(self.selected_token, new_rotation)

    def rotate_token(self, token_id, angle):
        if token_id in self.tokens:
            token_data = self.tokens[token_id]
            original_image = Image.open(token_data["file_path"])
            
            # Calculate the size based on the current grid size and zoom factor
            token_size = int(self.grid_size * self.zoom_factor)
            
            # Resize the original image to match the token size
            original_image = original_image.resize((token_size, token_size), Image.LANCZOS)
            
            # Rotate the image
            rotated_image = original_image.rotate(-angle, resample=Image.BICUBIC, expand=False)
            
            # Convert to PhotoImage
            token_tk_image = ImageTk.PhotoImage(rotated_image)
            
            # Update token data and canvas
            self.tokens[token_id]["image"] = token_tk_image
            self.canvas.itemconfig(token_id, image=token_tk_image)

    def edit_selected_token(self):
        selection = self.current_tokens_listbox.curselection()
        if selection:
            index = selection[0]
            token_name = self.current_tokens_listbox.get(index)
            token_id = next(tid for tid, name in self.current_tokens.items() if name == token_name)
            self.open_token_editor(token_id)

    def open_token_editor(self, token_id):
        token_data = self.tokens[token_id]
        editor_window = tk.Toplevel(self.master)
        editor_window.title("Edit Token")

        ttk.Label(editor_window, text="Token Name:").pack(pady=5)
        name_entry = ttk.Entry(editor_window)
        name_entry.insert(0, token_data["name"])
        name_entry.pack(pady=5)

        ttk.Button(editor_window, text="Change Image", command=lambda: self.change_token_image(token_id, editor_window)).pack(pady=5)

        ttk.Button(editor_window, text="Save Changes", command=lambda: self.save_token_changes(token_id, name_entry.get(), editor_window)).pack(pady=5)

    def change_token_image(self, token_id, editor_window):
        file_path = filedialog.askopenfilename(filetypes=[("Image files", "*.png *.jpg *.jpeg")])
        if file_path:
            self.tokens[token_id]["file_path"] = file_path
            self.update_token_image(token_id)
            messagebox.showinfo("Success", "Token image updated!", parent=editor_window)

    def update_token_image(self, token_id):
        token_data = self.tokens[token_id]
        token_image = Image.open(token_data["file_path"])
        token_tk_image = self.resize_token_image(token_image)
        self.tokens[token_id]["image"] = token_tk_image
        self.canvas.itemconfig(token_id, image=token_tk_image)

    def save_token_changes(self, token_id, new_name, editor_window):
        old_name = self.tokens[token_id]["name"]
        self.tokens[token_id]["name"] = new_name
        self.current_tokens[token_id] = new_name

        # Update the listbox
        index = self.current_tokens_listbox.get(0, tk.END).index(old_name)
        self.current_tokens_listbox.delete(index)
        self.current_tokens_listbox.insert(index, new_name)

        # Update the canvas
        name_id = self.tokens[token_id].get("name_id")
        if name_id:
            self.canvas.itemconfig(name_id, text=new_name)

        editor_window.destroy()


if __name__ == "__main__":
    root = tk.Tk()
    root.geometry("1000x600")

    # Ensure the window has all control buttons
    root.overrideredirect(False)
    root.resizable(True, True)
    
    root.mainloop()