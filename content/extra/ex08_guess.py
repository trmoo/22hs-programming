from tkinter import Tk, Label, Entry, Button
import random

정답 = random.randint(1, 100)
횟수 = 0

def 맞혀보기():
    global 횟수
    try:
        내답 = int(입력칸.get())
    except ValueError:
        결과라벨["text"] = "1부터 100까지의 수를 넣어 주세요"
        return
    횟수 += 1
    if 내답 < 정답:
        결과라벨["text"] = f"{내답} 보다 큽니다 ({횟수}번째)"
    elif 내답 > 정답:
        결과라벨["text"] = f"{내답} 보다 작습니다 ({횟수}번째)"
    else:
        결과라벨["text"] = f"맞혔습니다! {횟수}번에 성공"

창 = Tk()
창.title("숫자 맞히기")

Label(창, text="1~100 사이의 수를 맞혀 보자").pack(pady=8)

입력칸 = Entry(창, width=12)
입력칸.pack()

단추 = Button(창, text="확인", command=맞혀보기)
단추.pack(pady=6)

결과라벨 = Label(창, text="", font=("맑은 고딕", 12))
결과라벨.pack(pady=8)

창.mainloop()
