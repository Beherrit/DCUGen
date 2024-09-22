import tkinter as tk
from tkinter import filedialog, messagebox, simpledialog, colorchooser
from PIL import Image, ImageTk, ImageDraw
import json
import os
import shutil
import ttkbootstrap as ttk
from ttkbootstrap.constants import *
import pygame
from operator import itemgetter
from PIL import Image, ImageTk, ImageDraw, ImageOps, ImageChops
import math



# Main Application Class
class MainApplication:
    def __init__(self):
        self.root = tk.Tk()
        self.root.geometry("1000x600")
        self.root.overrideredirect(False)
        self.root.resizable(True, True)
        self.map_editor = MapEditor(self.root)
        self.root.mainloop()
# Map Editor Class
class MapEditor:
    def __init__(self, master):
        self.master = master
        self.master.title("GM Map")
        self.style = ttk.Style(theme='darkly')

        # Initialize components
        self.variables = EditorVariables()
        self.library_manager = LibraryManager()
        self.music_player = MusicPlayer()
        self.setup_ui()
        self.setup_tooltips()

    def setup_ui(self):
        self.master.columnconfigure(0, weight=1)
        self.master.rowconfigure(1, weight=1)

        # Create components
        self.toolbar = Toolbar(self.master, self)
        self.map_canvas = MapCanvas(self.master, self)
        self.sidebar = Sidebar(self.master, self)

    def setup_tooltips(self):
        self.map_canvas.setup_tooltips()

    # Methods that interact with components
    def upload_map(self, file_path=None):
        self.map_canvas.upload_map(file_path)

    def add_token(self, file_path=None, x=None, y=None):
        self.map_canvas.add_token(file_path, x, y)

    def fit_to_screen(self):
        self.map_canvas.fit_to_screen()

    def clear_map(self):
        self.map_canvas.clear_map()

    def rotate_selected_token(self):
        self.map_canvas.rotate_selected_token()

    def update_grid_size(self, value):
        self.variables.grid_size = int(float(value))
        self.map_canvas.update_grid_size()

    def toggle_always_on_top(self):
        self.master.attributes('-topmost', self.toolbar.always_on_top_var.get())

    def toggle_grid(self):
        self.variables.grid_visible = self.toolbar.toggle_grid_var.get()
        self.map_canvas.redraw()
# Variables Class
class EditorVariables:
    def __init__(self):
        self.grid_size = 50
        self.grid_visible = True
        self.zoom_factor = 1.0
# Toolbar Class
class Toolbar:
    def __init__(self, master, editor):
        self.master = master
        self.editor = editor
        self.create_toolbar()

    def create_toolbar(self):
        toolbar = ttk.Frame(self.master, padding="10 5 10 5")
        toolbar.grid(row=0, column=0, columnspan=2, sticky="ew")

        ttk.Button(toolbar, text="Upload Map", command=self.editor.upload_map, style='primary.TButton').pack(side=LEFT, padx=2)
        ttk.Button(toolbar, text="Add Token", command=self.editor.add_token, style='primary.TButton').pack(side=LEFT, padx=2)
        ttk.Button(toolbar, text="Fit to Screen", command=self.editor.fit_to_screen, style='primary.TButton').pack(side=LEFT, padx=2)
        ttk.Button(toolbar, text="Clear Map", command=self.editor.clear_map, style='danger.TButton').pack(side=LEFT, padx=2)
        ttk.Button(toolbar, text="Rotate Token", command=self.editor.rotate_selected_token, style='primary.TButton').pack(side=LEFT, padx=2)

        self.grid_size_var = tk.IntVar(value=self.editor.variables.grid_size)
        ttk.Label(toolbar, text="Grid Size:").pack(side=LEFT, padx=(10, 2))
        ttk.Scale(toolbar, from_=20, to=100, variable=self.grid_size_var, command=self.editor.update_grid_size).pack(side=LEFT, padx=2)

        self.always_on_top_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(toolbar, text="Always on Top", variable=self.always_on_top_var, command=self.editor.toggle_always_on_top).pack(side=RIGHT, padx=2)

        self.toggle_grid_var = tk.BooleanVar(value=self.editor.variables.grid_visible)
        ttk.Checkbutton(toolbar, text="Show Grid", variable=self.toggle_grid_var, command=self.editor.toggle_grid).pack(side=LEFT, padx=2)
# Map Canvas Class
class MapCanvas:
    def __init__(self, master, editor):
        self.master = master
        self.editor = editor
        self.setup_variables()
        self.create_canvas()
        self.setup_bindings()

    def setup_variables(self):
        self.tokens = {}
        self.token_rotation = {}
        self.range_start = None
        self.range_line = None
        self.range_text = None
        self.selected_token = None
        self.current_tokens = {}

    def create_canvas(self):
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

    def setup_bindings(self):
        self.canvas.bind("<ButtonPress-1>", self.on_click)
        self.canvas.bind("<B1-Motion>", self.on_drag)
        self.canvas.bind("<ButtonRelease-1>", self.on_release)
        self.canvas.bind("<ButtonPress-3>", self.on_right_click)
        self.canvas.bind("<B3-Motion>", self.on_right_drag)
        self.canvas.bind("<ButtonRelease-3>", self.on_right_release)
        self.canvas.bind("<KeyPress-r>", lambda event: self.rotate_selected_token())

    def setup_tooltips(self):
        self.tooltip = None

    # Canvas Interaction Methods
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
            self.editor.variables.zoom_factor = scale
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

            self.current_tokens[token_id] = token_name
            self.editor.sidebar.current_tokens_tab.update_tokens_list()
            self.editor.sidebar.initiative_tracker_tab.add_token(token_name)

            # Bind mouse events for tooltip
            self.canvas.tag_bind(token_id, "<Enter>", lambda e, tid=token_id: self.show_token_tooltip(e, tid))
            self.canvas.tag_bind(token_id, "<Leave>", self.hide_token_tooltip)

    def prompt_token_name(self):
        name = simpledialog.askstring("Token Name", "Enter a name for this token:")
        return name if name else ""

    def resize_token_image(self, image):
        token_size = int(self.editor.variables.grid_size * self.editor.variables.zoom_factor)
        resized_image = image.resize((token_size, token_size), Image.LANCZOS)
        return ImageTk.PhotoImage(resized_image)

    def update_grid_size(self):
        if hasattr(self, 'map_image'):
            self.redraw()
        if self.tokens:
            self.resize_all_tokens()

    def toggle_grid(self, visible):
        self.editor.variables.grid_visible = visible
        self.redraw()

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

            if self.editor.variables.grid_visible:
                self.draw_grid(x_offset, y_offset)

            self.redraw_tokens(x_offset, y_offset)

            self.canvas.config(scrollregion=(0, 0, canvas_width, canvas_height))

    def resize_all_tokens(self):
        if hasattr(self, 'canvas') and hasattr(self, 'map_image'):
            for token_id, token_data in self.tokens.items():
                self.update_token_image(token_id)

    def draw_grid(self, x_offset=0, y_offset=0):
        if self.editor.variables.grid_visible and hasattr(self, 'map_image'):
            width, height = self.map_image.size
            zoomed_grid_size = int(self.editor.variables.grid_size * self.editor.variables.zoom_factor)

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

                zoomed_x = int(new_x * self.editor.variables.zoom_factor) + x_offset
                zoomed_y = int(new_y * self.editor.variables.zoom_factor) + y_offset

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

                if token_data.get("name"):
                    text_id = self.canvas.create_text(zoomed_x, zoomed_y + int(self.editor.variables.grid_size * self.editor.variables.zoom_factor) // 2,
                                                      text=token_data["name"], fill="white", tags=("token_name",))
                    new_tokens[new_id]["name_id"] = text_id

        self.tokens = new_tokens

    def calculate_relative_position(self, x, y, width, height):
        rel_x = x / width if width > 0 else 0
        rel_y = y / height if height > 0 else 0
        return rel_x, rel_y

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

        dx = (end[0] - start[0]) / (self.editor.variables.grid_size * self.editor.variables.zoom_factor)
        dy = (end[1] - start[1]) / (self.editor.variables.grid_size * self.editor.variables.zoom_factor)
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

    def rotate_selected_token(self):
        if self.selected_token:
            current_rotation = self.token_rotation.get(self.selected_token, 0)
            new_rotation = (current_rotation + 45) % 360
            self.token_rotation[self.selected_token] = new_rotation
            self.rotate_token(self.selected_token, new_rotation)

    def rotate_token(self, token_id, angle):
        if token_id in self.tokens:
            token_data = self.tokens[token_id]
            original_image = Image.open(token_data["file_path"])

            token_size = int(self.editor.variables.grid_size * self.editor.variables.zoom_factor)
            original_image = original_image.resize((token_size, token_size), Image.LANCZOS)

            rotated_image = original_image.rotate(-angle, resample=Image.BICUBIC, expand=False)
            token_tk_image = ImageTk.PhotoImage(rotated_image)

            self.tokens[token_id]["image"] = token_tk_image
            self.canvas.itemconfig(token_id, image=token_tk_image)

    def update_token_image(self, token_id):
        token_data = self.tokens[token_id]
        token_image = Image.open(token_data["file_path"])
        rotation = self.token_rotation.get(token_id, 0)
        if rotation != 0:
            token_image = token_image.rotate(-rotation, resample=Image.BICUBIC, expand=True)
        token_tk_image = self.resize_token_image(token_image)
        self.tokens[token_id]["image"] = token_tk_image
        self.canvas.itemconfig(token_id, image=token_tk_image)

    def show_token_tooltip(self, event, token_id):
        token_name = self.tokens[token_id]["name"]
        x, y = self.canvas.canvasx(event.x), self.canvas.canvasy(event.y)
        self.tooltip = self.canvas.create_text(x, y - 20, text=token_name, fill="white", font=("Arial", 12), tags="tooltip")

    def hide_token_tooltip(self, event):
        if self.tooltip:
            self.canvas.delete(self.tooltip)
            self.tooltip = None

    def clear_map(self):
        self.canvas.delete("all")
        self.tokens.clear()
        self.current_tokens.clear()
        self.editor.sidebar.initiative_tracker_tab.clear_initiatives()
        if hasattr(self, 'map_image'):
            delattr(self, 'map_image')
        self.redraw()

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

            if self.editor.variables.grid_visible:
                self.draw_grid(x_offset, y_offset)

            self.redraw_tokens(x_offset, y_offset)

            self.canvas.config(scrollregion=(0, 0, canvas_width, canvas_height))

    def blink_token(self, token_id):
        if token_id in self.tokens:
            original_state = self.canvas.itemcget(token_id, 'state')
            for _ in range(6):  # Blink 3 times
                self.canvas.itemconfig(token_id, state='hidden')
                self.canvas.update()
                self.canvas.after(200)
                self.canvas.itemconfig(token_id, state='normal')
                self.canvas.update()
                self.canvas.after(200)
            self.canvas.itemconfig(token_id, state=original_state)

    def open_token_editor(self, token_id):
        if token_id in self.tokens:
            token_data = self.tokens[token_id]
            self.editor.sidebar.token_editor_tab.current_token = Image.open(token_data['file_path'])
            self.editor.sidebar.token_editor_tab.display_image()
            self.editor.sidebar.sidebar.select(self.editor.sidebar.sidebar.index(self.editor.sidebar.token_editor_tab))
            new_name = simpledialog.askstring("Edit Token", "Enter new name for the token:", initialvalue=token_data['name'])
            if new_name is not None:
                old_name = token_data['name']
                token_data['name'] = new_name
                self.current_tokens[token_id] = new_name
                self.editor.sidebar.current_tokens_tab.update_tokens_list()
                self.editor.sidebar.initiative_tracker_tab.update_token_name(old_name, new_name)
                
                # Update the token name on the canvas
                if 'name_id' in token_data:
                    self.canvas.itemconfig(token_data['name_id'], text=new_name)
# Sidebar Class
class Sidebar:
    def __init__(self, master, editor):
        self.master = master
        self.editor = editor
        self.create_sidebar()

    def create_sidebar(self):
        self.sidebar = ttk.Notebook(self.master, width=250)  # Set a fixed width for the sidebar
        self.sidebar.grid(row=1, column=1, sticky="ns")

        self.library_tab = LibraryTab(self.sidebar, self.editor)
        self.notes_tab = NotesTab(self.sidebar)
        self.music_tab = MusicTab(self.sidebar, self.editor)
        self.current_tokens_tab = CurrentTokensTab(self.sidebar, self.editor)
        self.initiative_tracker_tab = InitiativeTrackerTab(self.sidebar, self.editor)
        self.token_editor_tab = TokenEditorTab(self.sidebar, self.editor)  # Add this line

        # Configure column weight to make the sidebar stay at its fixed width
        self.master.grid_columnconfigure(1, weight=0)
# Library Manager Class
class LibraryManager:
    def __init__(self):
        self.library_data = {"maps": [], "tokens": [], "music": []}
        self.load_library_data()

    def load_library_data(self):
        if os.path.exists("library_data.json"):
            with open("library_data.json", "r") as f:
                self.library_data = json.load(f)
        else:
            self.library_data = {"maps": [], "tokens": [], "music": []}

    def save_library_data(self):
        with open("library_data.json", "w") as f:
            json.dump(self.library_data, f)
# Music Player Class
class MusicPlayer:
    def __init__(self):
        pygame.mixer.init()
        self.current_track = None
        self.is_playing = False

    def play_music(self, file_path):
        if self.current_track == file_path:
            if self.is_playing:
                pygame.mixer.music.pause()
                self.is_playing = False
            else:
                pygame.mixer.music.unpause()
                self.is_playing = True
        else:
            pygame.mixer.music.load(file_path)
            pygame.mixer.music.play()
            self.current_track = file_path
            self.is_playing = True

    def toggle_music(self):
        if self.current_track:
            if self.is_playing:
                pygame.mixer.music.pause()
                self.is_playing = False
            else:
                pygame.mixer.music.unpause()
                self.is_playing = True

    def next_track(self, library_data):
        if library_data["music"]:
            if self.current_track:
                current_index = library_data["music"].index(self.current_track)
                next_index = (current_index + 1) % len(library_data["music"])
            else:
                next_index = 0
            next_track = library_data["music"][next_index]
            self.play_music(next_track)

    def set_volume(self, volume):
        pygame.mixer.music.set_volume(volume)
# Library Tab Class
class LibraryTab:
    def __init__(self, notebook, editor):
        self.editor = editor
        self.create_tab(notebook)

    def create_tab(self, notebook):
        library_frame = ttk.Frame(notebook)
        notebook.add(library_frame, text="Library")

        ttk.Button(library_frame, text="Upload Map", command=lambda: self.upload_to_library("maps")).pack(fill=X, padx=5, pady=2)
        ttk.Button(library_frame, text="Upload Token", command=lambda: self.upload_to_library("tokens")).pack(fill=X, padx=5, pady=2)

        self.maps_listbox = tk.Listbox(library_frame, selectmode=SINGLE)
        self.maps_listbox.pack(fill=BOTH, expand=True, padx=5, pady=2)
        self.maps_listbox.bind('<Double-1>', lambda e: self.use_library_item("maps"))

        self.tokens_listbox = tk.Listbox(library_frame, selectmode=SINGLE)
        self.tokens_listbox.pack(fill=BOTH, expand=True, padx=5, pady=2)
        self.tokens_listbox.bind('<Double-1>', lambda e: self.use_library_item("tokens"))

        self.populate_library()

    def populate_library(self):
        for item in self.editor.library_manager.library_data["maps"]:
            self.maps_listbox.insert(END, os.path.basename(item))
        for item in self.editor.library_manager.library_data["tokens"]:
            self.tokens_listbox.insert(END, os.path.basename(item))

    def upload_to_library(self, category):
        file_path = filedialog.askopenfilename(filetypes=[("Image files", "*.png *.jpg *.jpeg")])
        if file_path:
            file_name = os.path.basename(file_path)
            destination = os.path.join("library", category, file_name)

            os.makedirs(os.path.dirname(destination), exist_ok=True)
            shutil.copy2(file_path, destination)

            self.editor.library_manager.library_data[category].append(destination)
            if category == "maps":
                self.maps_listbox.insert(END, file_name)
            elif category == "tokens":
                self.tokens_listbox.insert(END, file_name)

            self.editor.library_manager.save_library_data()

    def use_library_item(self, category):
        if category == "maps":
            selection = self.maps_listbox.curselection()
            if selection:
                index = selection[0]
                file_path = self.editor.library_manager.library_data["maps"][index]
                self.editor.upload_map(file_path)
        elif category == "tokens":
            selection = self.tokens_listbox.curselection()
            if selection:
                index = selection[0]
                file_path = self.editor.library_manager.library_data["tokens"][index]
                center_x, center_y = self.editor.map_canvas.get_map_center()
                self.editor.add_token(file_path, center_x, center_y)
# Notes Tab Class
class NotesTab:
    def __init__(self, notebook):
        self.create_tab(notebook)

    def create_tab(self, notebook):
        notes_frame = ttk.Frame(notebook)
        notebook.add(notes_frame, text="Notes")

        notes_text = tk.Text(notes_frame, wrap=WORD, width=25, height=20)
        notes_text.pack(fill=BOTH, expand=True, padx=5, pady=5)

        notes = [
            "To Start, Upload a Map and Tokens into the Library",
            "Double-click on a map in the library to set it as the current map",
            "Double-click on a token in the library to add it to the map",
            "Adjust the grid size using the slider in the toolbar",
            "Use the Blink Token button to blink the selected token",
            "Use the Edit Token button to edit the selected token",
            "Use the Delete Token button to delete the selected token",
            "Use the Play/Pause button to play or pause the current music",
            "Use the Next Track button to play the next track in the music library",
            "Use the Add Music button to add a new music file to the library",
            "Use the Current Tokens tab to manage the current tokens on the map",
            "Use the Initiative Tracker tab to manage the initiative order of the tokens",
            "Double-click on a token in the initiative tracker to edit its initiative value",
        ]

        for note in notes:
            notes_text.insert(END, note + "\n\n")
        notes_text.config(state=DISABLED)
# Music Tab Class
class MusicTab:
    def __init__(self, notebook, editor):
        self.editor = editor
        self.create_tab(notebook)

    def create_tab(self, notebook):
        music_frame = ttk.Frame(notebook)
        notebook.add(music_frame, text="Music")

        ttk.Button(music_frame, text="Add Music", command=self.add_music_to_library).pack(fill=X, padx=5, pady=2)

        self.music_listbox = tk.Listbox(music_frame, selectmode=SINGLE)
        self.music_listbox.pack(fill=BOTH, expand=True, padx=5, pady=2)
        self.music_listbox.bind('<Double-1>', self.on_music_double_click)

        controls_frame = ttk.Frame(music_frame)
        controls_frame.pack(fill=X, padx=5, pady=2)

        ttk.Button(controls_frame, text="Play/Pause", command=self.editor.music_player.toggle_music).pack(side=LEFT, padx=2)
        ttk.Button(controls_frame, text="Next Track", command=lambda: self.editor.music_player.next_track(self.editor.library_manager.library_data)).pack(side=LEFT, padx=2)

        # Add volume control
        volume_frame = ttk.Frame(music_frame)
        volume_frame.pack(fill=X, padx=5, pady=2)
        ttk.Label(volume_frame, text="Volume:").pack(side=LEFT)
        self.volume_slider = ttk.Scale(volume_frame, from_=0, to=1, orient=HORIZONTAL, command=self.set_volume)
        self.volume_slider.set(1)  # Set default volume to maximum
        self.volume_slider.pack(side=LEFT, expand=True, fill=X)

        self.populate_music()

    def set_volume(self, value):
        volume = float(value)
        self.editor.music_player.set_volume(volume)

    def populate_music(self):
        for item in self.editor.library_manager.library_data["music"]:
            self.music_listbox.insert(END, os.path.basename(item))

    def add_music_to_library(self):
        file_path = filedialog.askopenfilename(filetypes=[("Audio files", "*.mp3 *.wav")])
        if file_path:
            file_name = os.path.basename(file_path)
            destination = os.path.join("library", "music", file_name)

            os.makedirs(os.path.dirname(destination), exist_ok=True)
            shutil.copy2(file_path, destination)

            self.editor.library_manager.library_data["music"].append(destination)
            self.music_listbox.insert(END, file_name)

            self.editor.library_manager.save_library_data()

    def on_music_double_click(self, event):
        selection = self.music_listbox.curselection()
        if selection:
            index = selection[0]
            file_path = self.editor.library_manager.library_data["music"][index]
            self.editor.music_player.play_music(file_path)
# Current Tokens Tab Class
class CurrentTokensTab:
    def __init__(self, notebook, editor):
        self.editor = editor
        self.create_tab(notebook)

    def create_tab(self, notebook):
        current_tokens_frame = ttk.Frame(notebook)
        notebook.add(current_tokens_frame, text="Current Tokens")

        self.current_tokens_listbox = tk.Listbox(current_tokens_frame, selectmode=SINGLE)
        self.current_tokens_listbox.pack(fill=BOTH, expand=True, padx=5, pady=2)

        buttons_frame = ttk.Frame(current_tokens_frame)
        buttons_frame.pack(fill=X, padx=5, pady=2)

        ttk.Button(buttons_frame, text="Blink Token", command=self.blink_selected_token).pack(side=LEFT, padx=2)
        ttk.Button(buttons_frame, text="Edit Token", command=self.edit_selected_token).pack(side=LEFT, padx=2)
        ttk.Button(buttons_frame, text="Delete Token", command=self.delete_selected_token).pack(side=LEFT, padx=2)

    def update_tokens_list(self):
        self.current_tokens_listbox.delete(0, tk.END)
        for name in self.editor.map_canvas.current_tokens.values():
            self.current_tokens_listbox.insert(tk.END, name)

    def blink_selected_token(self):
        selection = self.current_tokens_listbox.curselection()
        if selection:
            index = selection[0]
            token_name = self.current_tokens_listbox.get(index)
            token_id = next(tid for tid, name in self.editor.map_canvas.current_tokens.items() if name == token_name)
            self.editor.map_canvas.blink_token(token_id)

    def edit_selected_token(self):
        selection = self.current_tokens_listbox.curselection()
        if selection:
            index = selection[0]
            token_name = self.current_tokens_listbox.get(index)
            token_id = next(tid for tid, name in self.editor.map_canvas.current_tokens.items() if name == token_name)
            self.editor.map_canvas.open_token_editor(token_id)

    def delete_selected_token(self):
        selection = self.current_tokens_listbox.curselection()
        if selection:
            index = selection[0]
            token_name = self.current_tokens_listbox.get(index)
            token_id = next(tid for tid, name in self.editor.map_canvas.current_tokens.items() if name == token_name)
            if token_id in self.editor.map_canvas.tokens:
                self.editor.map_canvas.canvas.delete(token_id)
                name_id = self.editor.map_canvas.tokens[token_id].get("name_id")
                if name_id:
                    self.editor.map_canvas.canvas.delete(name_id)

                del self.editor.map_canvas.tokens[token_id]
                del self.editor.map_canvas.current_tokens[token_id]

                self.current_tokens_listbox.delete(index)
                self.editor.sidebar.initiative_tracker_tab.remove_token(token_name)
# New InitiativeTrackerTab class
class InitiativeTrackerTab:
    def __init__(self, notebook, editor):
        self.editor = editor
        self.initiatives = []
        self.create_tab(notebook)

    def create_tab(self, notebook):
        initiative_frame = ttk.Frame(notebook)
        notebook.add(initiative_frame, text="Initiative Tracker")

        self.initiative_tree = ttk.Treeview(initiative_frame, columns=('Name', 'Initiative'), show='headings')
        self.initiative_tree.heading('Name', text='Name')
        self.initiative_tree.heading('Initiative', text='Initiative')
        self.initiative_tree.pack(fill=BOTH, expand=True, padx=5, pady=5)

        self.initiative_tree.bind('<Double-1>', self.on_double_click)

    def add_token(self, token_name):
        self.initiatives.append((token_name, ''))
        self.update_initiative_list()

    def remove_token(self, token_name):
        self.initiatives = [init for init in self.initiatives if init[0] != token_name]
        self.update_initiative_list()

    def update_initiative_list(self):
        self.initiative_tree.delete(*self.initiative_tree.get_children())
        sorted_initiatives = sorted(self.initiatives, key=lambda x: (x[1] != '', x[1]), reverse=True)
        for name, initiative in sorted_initiatives:
            self.initiative_tree.insert('', 'end', values=(name, initiative))

    def on_double_click(self, event):
        item = self.initiative_tree.selection()[0]
        column = self.initiative_tree.identify_column(event.x)
        if column == '#2':  # Initiative column
            current_value = self.initiative_tree.item(item, 'values')[1]
            new_value = simpledialog.askstring("Initiative", "Enter initiative value:", initialvalue=current_value)
            if new_value is not None:
                name = self.initiative_tree.item(item, 'values')[0]
                self.initiatives = [(n, i if n != name else new_value) for n, i in self.initiatives]
                self.update_initiative_list()

    def clear_initiatives(self):
        self.initiatives.clear()
        self.update_initiative_list()

    def update_token_name(self, old_name, new_name):
        for i, (name, initiative) in enumerate(self.initiatives):
            if name == old_name:
                self.initiatives[i] = (new_name, initiative)
                break
        self.update_initiative_list()
# New TokenEditorTab class
class TokenEditorTab:
    def __init__(self, notebook, editor):
        self.editor = editor
        self.current_token = None
        self.cropped_image = None
        self.border_color = "#FFFFFF"  # Default border color (white)
        self.border_width = 5  # Default border width
        self.create_tab(notebook)

    def create_tab(self, notebook):
        token_editor_frame = ttk.Frame(notebook)
        notebook.add(token_editor_frame, text="Token Editor")

        self.canvas = tk.Canvas(token_editor_frame, width=200, height=200)
        self.canvas.pack(pady=10)

        controls_frame = ttk.Frame(token_editor_frame)
        controls_frame.pack(fill=tk.X, padx=5, pady=5)

        ttk.Button(controls_frame, text="Load Image", command=self.load_image).pack(side=tk.LEFT, padx=2)
        ttk.Button(controls_frame, text="Crop", command=self.crop_image).pack(side=tk.LEFT, padx=2)

        # Border controls
        border_frame = ttk.LabelFrame(token_editor_frame, text="Border Options")
        border_frame.pack(fill=tk.X, padx=5, pady=5)

        ttk.Label(border_frame, text="Border Type:").grid(row=0, column=0, padx=2, pady=2)
        self.border_type = ttk.Combobox(border_frame, values=["Circle", "Square", "Hexagon"])
        self.border_type.set("Circle")
        self.border_type.grid(row=0, column=1, padx=2, pady=2)

        ttk.Button(border_frame, text="Border Color", command=self.choose_border_color).grid(row=1, column=0, padx=2, pady=2)
        self.color_preview = tk.Canvas(border_frame, width=20, height=20, bg=self.border_color)
        self.color_preview.grid(row=1, column=1, padx=2, pady=2)

        ttk.Label(border_frame, text="Border Width:").grid(row=2, column=0, padx=2, pady=2)
        self.border_width_scale = ttk.Scale(border_frame, from_=1, to=20, orient=tk.HORIZONTAL, command=self.update_border_width)
        self.border_width_scale.set(self.border_width)
        self.border_width_scale.grid(row=2, column=1, padx=2, pady=2, sticky="ew")

        ttk.Button(border_frame, text="Add Border", command=self.add_border).grid(row=3, column=0, columnspan=2, padx=2, pady=2)

        ttk.Button(controls_frame, text="Save", command=self.save_token).pack(side=tk.LEFT, padx=2)

    def load_image(self):
        file_path = filedialog.askopenfilename(filetypes=[("Image files", "*.png *.jpg *.jpeg")])
        if file_path:
            self.current_token = Image.open(file_path)
            self.display_image()

    def display_image(self):
        if self.current_token:
            resized = self.current_token.copy()
            resized.thumbnail((200, 200))
            self.tk_image = ImageTk.PhotoImage(resized)
            self.canvas.delete("all")
            self.canvas.create_image(100, 100, image=self.tk_image)

    def crop_image(self):
        if self.current_token:
            crop_window = tk.Toplevel(self.editor.master)
            crop_window.title("Crop Image")
            
            canvas = tk.Canvas(crop_window, width=400, height=400)
            canvas.pack()

            resized = self.current_token.copy()
            resized.thumbnail((400, 400))
            self.crop_tk_image = ImageTk.PhotoImage(resized)
            canvas.create_image(200, 200, image=self.crop_tk_image)

            crop_rect = None
            start_x = start_y = 0

            def start_crop(event):
                nonlocal crop_rect, start_x, start_y
                if crop_rect:
                    canvas.delete(crop_rect)
                start_x, start_y = event.x, event.y
                crop_rect = canvas.create_rectangle(start_x, start_y, start_x, start_y, outline="red")

            def drag_crop(event):
                nonlocal crop_rect
                if crop_rect:
                    canvas.coords(crop_rect, start_x, start_y, event.x, event.y)

            def end_crop(event):
                nonlocal crop_rect
                if crop_rect:
                    x1, y1, x2, y2 = canvas.coords(crop_rect)
                    x1, x2 = min(x1, x2), max(x1, x2)
                    y1, y2 = min(y1, y2), max(y1, y2)
                    ratio = self.current_token.width / 400
                    crop_box = (int(x1 * ratio), int(y1 * ratio), int(x2 * ratio), int(y2 * ratio))
                    self.cropped_image = self.current_token.crop(crop_box)
                    self.current_token = self.cropped_image
                    self.display_image()
                    crop_window.destroy()

            canvas.bind("<ButtonPress-1>", start_crop)
            canvas.bind("<B1-Motion>", drag_crop)
            canvas.bind("<ButtonRelease-1>", end_crop)

    def choose_border_color(self):
        color = colorchooser.askcolor(self.border_color)
        if color[1]:
            self.border_color = color[1]
            self.color_preview.config(bg=self.border_color)

    def update_border_width(self, value):
        self.border_width = int(float(value))

    def add_border(self):
        if self.current_token:
            if self.current_token.mode != 'RGBA':
                self.current_token = self.current_token.convert('RGBA')
            
            size = min(self.current_token.size)
            new_size = size + 2 * self.border_width
            border_type = self.border_type.get()

            # Create a new square image with a transparent background
            bordered = Image.new('RGBA', (new_size, new_size), (0, 0, 0, 0))

            # Create mask based on border type
            mask = Image.new('L', (new_size, new_size), 0)
            draw = ImageDraw.Draw(mask)

            if border_type == "Circle":
                draw.ellipse((self.border_width, self.border_width, new_size - self.border_width, new_size - self.border_width), fill=255)
            elif border_type == "Square":
                draw.rectangle((self.border_width, self.border_width, new_size - self.border_width, new_size - self.border_width), fill=255)
            elif border_type == "Hexagon":
                # Draw a hexagon
                width, height = new_size - 2 * self.border_width, new_size - 2 * self.border_width
                center = new_size // 2
                points = [
                    (center, self.border_width),
                    (center + width//2, center - height//4),
                    (center + width//2, center + height//4),
                    (center, new_size - self.border_width),
                    (center - width//2, center + height//4),
                    (center - width//2, center - height//4)
                ]
                draw.polygon(points, fill=255)

            # Resize and center the original image
            resized_token = self.current_token.copy()
            resized_token.thumbnail((new_size - 2*self.border_width, new_size - 2*self.border_width), Image.LANCZOS)
            offset = ((new_size - resized_token.width) // 2, (new_size - resized_token.height) // 2)
            bordered.paste(resized_token, offset, resized_token)

            # Apply the mask to the image
            bordered.putalpha(ImageChops.multiply(bordered.split()[3], mask))

            # Create the border image
            border_image = Image.new('RGBA', (new_size, new_size), (0, 0, 0, 0))
            border_draw = ImageDraw.Draw(border_image)
            if border_type == "Circle":
                border_draw.ellipse((0, 0, new_size-1, new_size-1), outline=self.border_color, width=self.border_width)
            elif border_type == "Square":
                border_draw.rectangle((0, 0, new_size-1, new_size-1), outline=self.border_color, width=self.border_width)
            elif border_type == "Hexagon":
                border_draw.polygon(points, outline=self.border_color, width=self.border_width)

            # Composite the border and the image
            self.current_token = Image.alpha_composite(bordered, border_image)
            self.display_image()

    def save_token(self):
        if self.current_token:
            # Create the library directory if it doesn't exist
            library_dir = os.path.join(os.getcwd(), "library", "tokens")
            os.makedirs(library_dir, exist_ok=True)

            # Open the file dialog with the library directory as the initial directory
            file_path = filedialog.asksaveasfilename(
                initialdir=library_dir,
                defaultextension=".png",
                filetypes=[("PNG files", "*.png")]
            )
            if file_path:
                self.current_token.save(file_path)
                self.editor.library_manager.library_data["tokens"].append(file_path)
                self.editor.library_manager.save_library_data()
                self.editor.sidebar.library_tab.populate_library()
# Run the application
if __name__ == "__main__":
    MainApplication()
