from tkinter import Tk, Canvas

창 = Tk()
창.title("캔버스에 그리기")

캔버스 = Canvas(창, width=300, height=180, bg="white")
캔버스.pack()

캔버스.create_rectangle(20, 20, 130, 90, fill="skyblue")
캔버스.create_oval(150, 20, 280, 90, fill="lightgreen")
캔버스.create_line(20, 120, 280, 120, width=3)
캔버스.create_text(150, 150, text="(0,0) 은 왼쪽 위", font=("맑은 고딕", 11))

창.mainloop()
