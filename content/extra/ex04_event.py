from tkinter import Tk, Label, Button

def 눌렀을때():
    라벨["text"] = "단추를 눌렀다"

창 = Tk()
창.title("이벤트")
창.geometry("300x130")

라벨 = Label(창, text="아직 누르지 않았다", font=("맑은 고딕", 12))
라벨.pack(pady=18)

단추 = Button(창, text="눌러 보기", command=눌렀을때)
단추.pack()

창.mainloop()
