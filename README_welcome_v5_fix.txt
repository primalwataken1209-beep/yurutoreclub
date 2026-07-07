原因: 以前のウェルカム既読フラグ(yurutore_welcome_seen_v4)がブラウザに残っていると、ウェルカム画面がスキップされていました。
対策: 今回は新しい既読フラグ(yurutore_welcome_seen_v5_food)に変更し、初回表示が必ず出るようにしました。必要なら index.html#welcome または ?welcome=1 でも再表示できます。
