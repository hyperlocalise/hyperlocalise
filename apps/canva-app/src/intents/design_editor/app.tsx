import { Button, Rows, Text } from "@canva/app-ui-kit";
import { editContent } from "@canva/design";
import { useState } from "react";
import * as styles from "../../../styles/components.css";
import { convertWordsToLorem } from "./lorem_generator";

const enum Task {
  WITH_FORMATTING,
  WITHOUT_FORMATTING,
}

export const App = () => {
  const [inProgressTask, setInProgressTask] = useState<Task | undefined>(undefined);

  const translateWithoutFormatting = async () => {
    setInProgressTask(Task.WITHOUT_FORMATTING);
    try {
      await editContent(
        {
          contentType: "richtext",
          target: "current_page",
        },
        async (session) => {
          const request: string[][] = session.contents.map((range) => [range.readPlaintext()]);

          const response = await getTranslation(request);

          session.contents.forEach((range, i) => {
            const length = range.readPlaintext().length;
            const translatedText = response[i]?.[0];
            if (translatedText) {
              range.replaceText({ index: 0, length }, translatedText);
            }
          });

          await session.sync();
        },
      );
    } finally {
      setInProgressTask(undefined);
    }
  };

  const translateWithFormatting = async () => {
    setInProgressTask(Task.WITH_FORMATTING);
    try {
      await editContent(
        {
          contentType: "richtext",
          target: "current_page",
        },
        async (session) => {
          const request = session.contents.map((range) =>
            range.readTextRegions().map((region) => region.text),
          );

          const response = await getTranslation(request);

          session.contents.forEach((range, index) => {
            const translatedRegions = response[index];
            let endOfRegion = range.readPlaintext().length;
            const regionsToTranslate = range.readTextRegions();
            regionsToTranslate.reverse().forEach((region, i) => {
              endOfRegion = endOfRegion - region.text.length;
              const translatedText = translatedRegions?.[regionsToTranslate.length - 1 - i];
              if (translatedText) {
                range.replaceText(
                  {
                    index: endOfRegion,
                    length: region.text.length,
                  },
                  translatedText,
                );
              }
            });
          });

          await session.sync();
        },
      );
    } finally {
      setInProgressTask(undefined);
    }
  };

  return (
    <div className={styles.scrollContainer}>
      <Rows spacing="2u">
        <Text>
          This example demonstrates how apps can translate all text in the current page. Translation
          is simulated with lorem ipsum placeholder text.
        </Text>
        <Button
          variant="secondary"
          onClick={translateWithFormatting}
          disabled={inProgressTask != null}
          loading={inProgressTask === Task.WITH_FORMATTING}
        >
          Translate with formatting
        </Button>
        <Button
          variant="secondary"
          onClick={translateWithoutFormatting}
          disabled={inProgressTask != null}
          loading={inProgressTask === Task.WITHOUT_FORMATTING}
        >
          Translate without formatting
        </Button>
      </Rows>
    </div>
  );
};

async function getTranslation(text: string[][]): Promise<string[][]> {
  await new Promise((res) => setTimeout(res, 500));
  return text.map((t) => convertWordsToLorem(t));
}
