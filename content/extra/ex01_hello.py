from tkinter import Tk, Label

창 = Tk()
창.title("첫 창")
창.geometry("300x120")

라벨 = Label(창, text="처음 만든 창입니다", font=("맑은 고딕", 14))
라벨.pack(pady=35)

창.mainloop()
