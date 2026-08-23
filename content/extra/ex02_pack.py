from tkinter import Tk, Button

창 = Tk()
창.title("pack 으로 나란히")
창.geometry("320x90")

Button(창, text="왼쪽").pack(side="left", padx=10, pady=25)
Button(창, text="가운데").pack(side="left", padx=10, pady=25)
Button(창, text="오른쪽").pack(side="left", padx=10, pady=25)

창.mainloop()
