import { Stack } from "expo-router";

export default function SkillLayout() {
    return (
        <Stack>
            <Stack.Screen name="skills1" options={{headerShown: false}} />
        </Stack>
    )
}