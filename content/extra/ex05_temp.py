from tkinter import Tk, Label, Entry, Button

def 변환하기():
    try:
        화씨 = float(입력칸.get())
    except ValueError:
        결과라벨["text"] = "숫자를 넣어 주세요"
        return
    섭씨 = (화씨 - 32) * 5 / 9
    결과라벨["text"] = f"섭씨 {섭씨:.1f}도"

창 = Tk()
창.title("온도 변환기")

Label(창, text="화씨").grid(row=0, column=0, padx=8, pady=10)
입력칸 = Entry(창, width=10)
입력칸.grid(row=0, column=1, padx=8, pady=10)

단추 = Button(창, text="섭씨로 바꾸기", command=변환하기)
단추.grid(row=1, column=0, columnspan=2, pady=4)

결과라벨 = Label(창, text="결과가 여기 나온다", font=("맑은 고딕", 12))
결과라벨.grid(row=2, column=0, columnspan=2, pady=10)

창.mainloop()
