import base64

with open('C:/Users/Lawre/Desktop/DCUGen/CharSheet.pdf', 'rb') as pdf_file:
    encoded_pdf = base64.b64encode(pdf_file.read()).decode('utf-8')

with open('C:/Users/Lawre/Desktop/DCUGen/output.txt', 'w') as text_file:
    text_file.write(encoded_pdf)

