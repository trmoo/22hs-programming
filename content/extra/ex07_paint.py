from tkinter import Tk, Canvas

def 그리기(사건):
    x, y = 사건.x, 사건.y
    캔버스.create_oval(x - 2, y - 2, x + 2, y + 2, fill="black", outline="black")

창 = Tk()
창.title("그림판")

캔버스 = Canvas(창, width=300, height=180, bg="white")
캔버스.pack()
캔버스.bind("<B1-Motion>", 그리기)

창.mainloop()
