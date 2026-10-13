#!/usr/bin/env python3
# pip install edge-tts  (ffmpeg sudah ada)
import asyncio, os, subprocess, edge_tts

NARRATOR = "en-GB-RyanNeural"     # narator British
MAN      = "en-GB-RyanNeural"     # pria British
WOMAN    = "en-GB-SoniaNeural"    # wanita British
OUT, TMP = "audio", "tmp_parts"
os.makedirs(OUT, exist_ok=True); os.makedirs(TMP, exist_ok=True)

# 30 soal: (id, [(speaker,line)...], question)
SOAL = [
("q01",[("W","Since you missed the deadline, you'll have to apply next semester when the office reopens."),("M","That's fine, I'm planning to improve my essay anyway before submitting it.")],'What does "that" in the man\'s response refer to?'),
("q02",[("M","I thought the seminar would be boring, but it turned out to be quite engaging, which surprised everyone."),("W","Really? Then I should have attended it instead of staying home.")],'What does "it" refer to in the woman\'s response?'),
("q03",[("W","The professor said that anyone who submits the paper after Friday will lose points."),("M","Then I'd better finish this tonight so I don't run into that problem.")],'What does "that problem" refer to?'),
("q04",[("M","If the weather clears up, we could go to the beach where my cousin works this weekend."),("W","Sounds good, but I can't make it there until Saturday afternoon.")],'What does "there" refer to?'),
("q05",[("W","The library is closing early today because the staff has a meeting that will last two hours."),("M","I see, so I'll just borrow these books now before that happens.")],'What does "that" refer to?'),
("q06",[("M","Although I studied all night, I still failed the quiz that everyone said was easy."),("W","Don't worry, this one was harder than the last one we took.")],'What does "this one" refer to?'),
("q07",[("W","The museum, which opened last month, offers free entry on Sundays when most students are available."),("M","Great, then I'll visit it this week since I have no classes then.")],'What does "then" refer to?'),
("q08",[("M","The company said the interview would take place in the building that was just renovated downtown."),("W","OK, I'll meet you there an hour early so we can prepare.")],'What does "there" refer to?'),
("q09",[("M","The professor extended the deadline, but he expects everyone to submit their best work regardless."),("W","I understand, so I'll stay up late tonight and revise this thoroughly.")],'What does "this" refer to in the woman\'s response?'),
("q10",[("W","The train was delayed again, and the station announced that we should wait on platform two."),("M","Fine, I'll wait there and call you when the train arrives.")],'What does "there" refer to?'),
("q11",[("M","The cafeteria closed early today, so we'll have to eat somewhere else near campus."),("W","No problem, I know a place over there where the food is cheap.")],'What does "there" refer to?'),
("q12",[("W","My laptop crashed last night, and now it won't turn on no matter what I try."),("M","You should take that to the repair shop before the warranty ends.")],'What does "that" refer to?'),
("q13",[("M","The concert was sold out, but they added a second show for next Friday."),("W","Great, I'll buy tickets for that before they're gone too.")],'What does "that" refer to?'),
("q14",[("W","I left my umbrella at the cafe, and it's pouring outside right now."),("M","Don't worry, I can lend you mine so you can get home dry.")],'What does "mine" refer to?'),
("q15",[("M","The application form must be signed by Friday, or it will be rejected by the committee."),("W","OK, I'll print this tonight and bring it to their office tomorrow.")],'What does "this" refer to?'),
("q16",[("W","I finally got the internship I interviewed for last week, although the salary is lower than I expected."),("M","That's great! At least it will give you valuable experience in your field.")],'What does "it" refer to?'),
("q17",[("M","My advisor, who has published many papers on linguistics, recommended that I read this book before the seminar."),("W","If she thinks it's important, you should finish it this week.")],'Who does "she" refer to?'),
("q18",[("W","The laptop that I bought last month keeps shutting down, even though the technician already checked it."),("M","Maybe you should return it while the warranty is still valid.")],'What does "it" refer to?'),
("q19",[("M","The committee, which met yesterday to discuss the budget, will announce its decision tomorrow."),("W","I hope they choose the plan that helps the students most.")],'Who does "they" refer to?'),
("q20",[("W","The novel that won the national award was written by an author who lives in Bali."),("M","I've met him once at a book fair, and he was very humble.")],'Who does "him" refer to?'),
("q21",[("M","The lab assistant who supervised my experiment said the results were promising, though they need more testing."),("W","Then you should follow her advice and repeat it carefully.")],'What does "it" refer to?'),
("q22",[("W","The company that hired me last year has now moved its office to Surabaya."),("M","That's far, but as long as they pay well, it should be fine.")],'Who does "they" refer to?'),
("q23",[("M","The scholarship program, which supports students from rural areas, requires applicants to submit an essay."),("W","I know someone who joined it last year, and she said the essay mattered most.")],'Who does "she" refer to?'),
("q24",[("W","Professor Lee canceled his two p.m. class, and he asked us to complete the reading before Friday."),("M","OK, I'll finish chapter five tonight so I can discuss it with him next week.")],'Who does "him" refer to?'),
("q25",[("M","Sarah lost her notebook, and she asked me to help her look for it in the library."),("W","I saw someone return one this morning, so maybe it's already there.")],'What does "it" refer to?'),
("q26",[("W","The movers arrived late, but they still managed to finish unloading the truck by noon."),("M","Then we can start unpacking, since they did their job well.")],'Who does "they" refer to?'),
("q27",[("M","I called the clinic, and the nurse told me that the doctor would call me back today."),("W","If he doesn't, you should visit the clinic yourself tomorrow.")],'Who does "he" refer to?'),
("q28",[("W","My brother bought two tickets, and he gave one to me for the concert."),("M","That's nice, but I hope the singer performs the songs you both like.")],'Who does "you both" refer to?'),
("q29",[("M","The new students joined the club, and they were assigned a mentor each."),("W","That's helpful, but I wonder who chooses those mentors.")],'Who does "they" refer to?'),
("q30",[("M","The team won the final match, and its coach praised the players publicly."),("W","I heard the captain thanked him in return during the ceremony.")],'Who does "him" refer to?'),
]

V = {"N":NARRATOR,"M":MAN,"W":WOMAN}

async def say(text, voice, out):
    await edge_tts.Communicate(text, voice).save(out)

def sil(d, name):
    p=f"{TMP}/{name}.mp3"
    subprocess.run(["ffmpeg","-y","-f","lavfi","-i","anullsrc=r=24000:cl=mono",
                    "-t",str(d),"-q:a","9",p],check=True)
    return p

async def main():
    sil(3,"s3"); sil(2,"s2"); sil(5,"s5")
    seq=[]
    await say("Questions 1 through 30. In this part you will hear thirty short conversations. Listen carefully and choose the best answer.", NARRATOR, f"{TMP}/intro.mp3")
    seq += [f"{TMP}/intro.mp3", f"{TMP}/s3.mp3"]
    for i,(qid,turns,qtext) in enumerate(SOAL,1):
        parts=[]
        pn=f"{TMP}/{qid}_n.mp3"; await say(f"Question {i}.", NARRATOR, pn); parts.append(pn)
        for j,(spk,line) in enumerate(turns):
            p=f"{TMP}/{qid}_{j}.mp3"; await say(line, V[spk], p); parts.append(p)
        pq=f"{TMP}/{qid}_q.mp3"; await say(qtext, NARRATOR, pq); parts.append(pq)
        lst=f"{TMP}/{qid}.txt"
        with open(lst,"w") as fh:
            for x in parts: fh.write(f"file '{os.path.abspath(x)}'\n")
            fh.write(f"file '{os.path.abspath(TMP)}/s2.mp3'\n")
        qmp3=f"{TMP}/{qid}.mp3"
        subprocess.run(["ffmpeg","-y","-f","concat","-safe","0","-i",lst,"-c","copy",qmp3],check=True)
        seq += [qmp3, f"{TMP}/s5.mp3"]
    lst=f"{TMP}/final.txt"
    with open(lst,"w") as fh:
        for x in seq: fh.write(f"file '{os.path.abspath(x)}'\n")
    subprocess.run(["ffmpeg","-y","-f","concat","-safe","0","-i",lst,"-c","copy",f"{OUT}/audio_full.mp3"],check=True)
    print("SELESAI ->", f"{OUT}/audio_full.mp3")

asyncio.run(main())
