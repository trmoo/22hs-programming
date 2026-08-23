from tkinter import Tk, Label, Entry, Button

창 = Tk()
창.title("grid 로 표처럼")

Label(창, text="이름").grid(row=0, column=0, padx=8, pady=8)
Entry(창).grid(row=0, column=1, padx=8, pady=8)

Label(창, text="나이").grid(row=1, column=0, padx=8, pady=8)
Entry(창).grid(row=1, column=1, padx=8, pady=8)

Button(창, text="저장").grid(row=2, column=0, columnspan=2, pady=8)

창.mainloop()
