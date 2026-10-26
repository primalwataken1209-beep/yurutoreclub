# v51.4.7 公開前の追加準備

退会関数の supabase-js を 2.118.0 に固定した。変更は import の版指定のみ。URL依存の推移的依存やホスト実行環境全体を固定したという意味ではない。

scripts/build-public.cjs は確認済みの静的ファイル106件だけを dist にコピーする。既存dist、staging接続先、未確認の件数変更は拒否する。実行は公開を伴わない。

docs/netlify-production.toml.example は将来の設定案で、現在のnetlify.tomlには適用していない。準備ブランチの全デプロイ停止を維持する。

固定前の退会関数はstagingで合格・後片付け済み。固定後の関数をstagingへ反映するには別途承認が必要。本番反映・マージ・本番DB変更は承認範囲外。
