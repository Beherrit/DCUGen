import json
import random

# Load the vehicle data
with open('./json/vehicles.json', 'r') as file:
    data = json.load(file)

def get_random_feature(features, points):
    eligible = [f for f in features if f['cost'] <= points]
    if not eligible:
        return None
    feature = random.choice(eligible)
    return feature

def create_vehicle(points):
    vehicle = {}
    remaining_points = points

    # Assign a size
    size = get_random_feature(data['Sizes'], remaining_points)
    if size:
        vehicle['Size'] = size['name']
        remaining_points -= size['cost']

    # Assign features while points allow
    vehicle['Features'] = []
    while (feature := get_random_feature(data['Features'], remaining_points)) is not None:
        vehicle['Features'].append(feature['name'])
        remaining_points -= feature['cost']

    # Assign powers similarly
    vehicle['Powers'] = []
    while (power := get_random_feature(data['Powers'], remaining_points)) is not None:
        vehicle['Powers'].append(power['name'])
        remaining_points -= power['cost']

    return vehicle

# Example of generating a vehicle with 50 points
print(create_vehicle(50))
