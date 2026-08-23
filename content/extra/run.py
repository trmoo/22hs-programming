# -*- coding: utf-8 -*-
"""
tkinter 예제를 실제로 실행해 확인하고, 창 모습을 PNG 로 담는다.

  python run.py

mainloop() 은 끝나지 않으므로 갈아 끼운다 — 창을 한 번 그리고, 필요하면
연출(단추 누름 등)을 한 뒤 화면을 잡고 닫는다. 이렇게 하면
「예제가 오류 없이 돈다」는 것을 종이에 싣기 전에 확인할 수 있다.
"""
import io
import sys
import traceback
from pathlib import Path

import ctypes
import ctypes.wintypes
import tkinter as tk
from PIL import ImageGrab


def 창테두리(창):
    """창의 «정확한» 화면 위치를 물리 픽셀로 얻는다 (제목 줄 포함).

    여백을 어림으로 주어 잘라 냈더니 제목 줄 위로 뒤에 있던 다른 창이
    같이 찍혔다. DWM 에게 실제 테두리를 물어보면 어림이 필요 없다.
    """
    try:
        창.update_idletasks()
        hwnd = ctypes.windll.user32.GetParent(창.winfo_id()) or 창.winfo_id()
        rect = ctypes.wintypes.RECT()
        # DWMWA_EXTENDED_FRAME_BOUNDS = 9
        hr = ctypes.windll.dwmapi.DwmGetWindowAttribute(
            ctypes.wintypes.HWND(hwnd), ctypes.c_uint(9),
            ctypes.byref(rect), ctypes.sizeof(rect))
        if hr != 0:
            return None
        return (rect.left, rect.top, rect.right, rect.bottom)
    except Exception:
        return None

여기 = Path(__file__).parent
그림폴더 = 여기 / 'shots'
그림폴더.mkdir(exist_ok=True)

# 예제마다 「캡처 전에 이렇게 만져 보라」는 연출.
# 학생이 보는 코드에는 없는 부분이라 여기에 따로 둔다.
연출 = {
    'ex04_event': lambda ns: ns['단추'].invoke(),
    'ex05_temp': lambda ns: (ns['입력칸'].insert(0, '100'), ns['단추'].invoke()),
    'ex07_paint': lambda ns: _그리기(ns),
    'ex08_guess': lambda ns: (ns['입력칸'].insert(0, '50'), ns['단추'].invoke()),
}


def _그리기(ns):
    """그림판 예제 — 마우스 이벤트를 흉내 내어 선을 몇 개 긋는다"""
    캔버스 = ns['캔버스']
    for x in range(60, 240, 4):
        y = 120 + int((x - 150) ** 2 / 260)
        캔버스.create_oval(x - 2, y - 2, x + 2, y + 2, fill='black', outline='black')
    for x in range(60, 240, 4):
        캔버스.create_oval(x - 2, 58, x + 2, 62, fill='black', outline='black')


def 실행(경로: Path):
    이름 = 경로.stem
    담긴것 = {}
    원래 = tk.Misc.mainloop
    잡은창 = []

    def 갈아낀mainloop(self, n=0):
        창 = self.winfo_toplevel()
        잡은창.append(창)
        raise SystemExit  # 여기서 멈추고 아래에서 마무리한다

    tk.Misc.mainloop = 갈아낀mainloop
    tk.mainloop = lambda n=0: (_ for _ in ()).throw(SystemExit)

    표준출력 = io.StringIO()
    진짜stdout = sys.stdout
    sys.stdout = 표준출력
    오류 = None
    try:
        code = compile(경로.read_text(encoding='utf-8'), str(경로), 'exec')
        exec(code, 담긴것)
    except SystemExit:
        pass
    except Exception:
        오류 = traceback.format_exc()
    finally:
        sys.stdout = 진짜stdout
        tk.Misc.mainloop = 원래

    if 오류:
        return {'이름': 이름, '결과': '실패', '오류': 오류, '출력': 표준출력.getvalue()}

    창 = 잡은창[0] if 잡은창 else None
    if 창 is None:
        return {'이름': 이름, '결과': '실패', '오류': 'mainloop 를 부르지 않았다', '출력': ''}

    try:
        창.update_idletasks()
        창.update()
        if 이름 in 연출:
            sys.stdout = 표준출력
            try:
                연출[이름](담긴것)
            finally:
                sys.stdout = 진짜stdout
            창.update_idletasks()
            창.update()

        # 창을 늘 같은 자리에 놓고 맨 앞으로 올린다 (학생이 보는 코드에는 없는 부분)
        창.geometry('+120+120')
        창.attributes('-topmost', True)
        창.lift()
        창.update()
        창.after(350)
        창.update()

        # ⚠️ 윈도우 화면 배율(125%·150%)이 걸리면 tkinter 가 말하는 좌표(논리 픽셀)와
        #    ImageGrab 이 잡는 좌표(물리 픽셀)가 어긋나 엉뚱한 데를 자른다.
        #    전체 화면을 한 번 잡아 배율을 구해 맞춘다.
        전체 = ImageGrab.grab()
        배율 = 전체.width / 창.winfo_screenwidth()
        w, h = 창.winfo_width(), 창.winfo_height()

        테두리 = 창테두리(창)
        if 테두리:
            상자 = 테두리                                  # 이미 물리 픽셀이다
        else:
            # 물어볼 수 없으면 어림으로 — 뒤 창이 조금 섞일 수 있다
            x, y = 창.winfo_rootx(), 창.winfo_rooty()
            상자 = (int((x - 9) * 배율), int((y - 34) * 배율),
                    int((x + w + 9) * 배율), int((y + h + 9) * 배율))
        그림 = 전체.crop(상자)
        그림.save(그림폴더 / f'{이름}.png')
        크기 = (w, h)
    except Exception:
        return {'이름': 이름, '결과': '실패', '오류': traceback.format_exc(), '출력': 표준출력.getvalue()}
    finally:
        try:
            창.destroy()
        except Exception:
            pass

    return {'이름': 이름, '결과': '통과', '크기': 크기, '출력': 표준출력.getvalue()}


def 주():
    예제들 = sorted(여기.glob('ex*.py'))
    실패 = 0
    for 경로 in 예제들:
        r = 실행(경로)
        if r['결과'] == '통과':
            print(f"  ok   {r['이름']}  창 {r['크기'][0]}x{r['크기'][1]}"
                  + (f"  · 출력 {r['출력'].strip()!r}" if r['출력'].strip() else ''))
        else:
            실패 += 1
            print(f"  오류 {r['이름']}\n{r['오류']}")
    print(f"\n{'통과' if 실패 == 0 else '실패'} - 예제 {len(예제들)}개, 오류 {실패}건")
    return 1 if 실패 else 0


if __name__ == '__main__':
    raise SystemExit(주())
