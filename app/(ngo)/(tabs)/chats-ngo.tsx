import { useEffect, useState } from "react";
import * as SecureStore from 'expo-secure-store';
import { CometChat } from "@cometchat-pro/react-native-chat";
import { ActivityIndicator, Button, Image, Modal, SafeAreaView, ScrollView, Text, TextInput, Touchable, TouchableOpacity, View } from "react-native";
import { addDoc, collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/firebase/firebaseConfig";

export default function ChatsHome() {
    const [user, setUser] = useState<any>(null);
    const [userloading, setUserLoading] = useState<boolean>(true);
    const [chatVisible, setChatVisible] = useState<boolean>(false);
    const [createGroup, setCreateGroup] = useState<boolean>(false);
    const [previousMessages, setPreviousMessages] = useState<any[]>([]);
    const [chatGroup, setChatGroup] = useState<any>(null);
    const [showGroupInfo, setShowGroupInfo] = useState<boolean>(false);
    const [chatGroupInfo, setChatGroupInfo] = useState<any>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [chatGroupMembers, setChatGroupMembers] = useState<any[]>([]);
    const [conversations, setConversations] = useState<any[]>([]);
    const [message, setMessage] = useState<string>('');
    const [groupName, setGroupName] = useState<string>('');
    const [groupDescription, setGroupDescription] = useState<string>('');

    useEffect(() => {
        const fetchUser = async () => {
            const user = await SecureStore.getItemAsync('ngo');
            if (user) {
                const userData = JSON.parse(user);
                setUser(userData);
                setUserLoading(false);
            }
        }
        fetchUser();
    }, []);

    const handleGroupCreation = async () => {
        if (!userloading && user && user?.designation === 'head' && groupName && groupDescription) {
            setLoading(true)
            let members: CometChat.GroupMember[] = [];
            let memberDetails: any[] = [];
            const q = query(collection(db, 'users'), where('type.name', '==', user.type['name']), where('designation', '==', 'head'));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
                querySnapshot.forEach(doc => {
                    memberDetails.push({ id: doc.id, name: doc.data().name });
                    if (doc.id !== user.id) {
                        const member = new CometChat.GroupMember(doc.id, CometChat.GROUP_MEMBER_SCOPE.ADMIN);
                        members.push(member);
                    }
                });
                const GUID = "group_" + new Date().getTime();
                const group = new CometChat.Group(GUID, groupName, CometChat.GROUP_TYPE.PUBLIC, '', 'https://firebasestorage.googleapis.com/v0/b/voluntech-18f11.appspot.com/o/users%2Fproof%2Fgroup.png?alt=media&token=4cc5db22-16a2-47ff-a66e-8fa486c3a595', groupDescription, true);
                await CometChat.createGroupWithMembers(group, members, []).then(async (createdGroup: any) => {
                    console.log('Group created successfully:', { createdGroup });
                    await addDoc(collection(db, 'groups'), {
                        guid: GUID,
                        name: groupName,
                        description: groupDescription,
                        members: memberDetails,
                        ngo: user.type
                    });
    
                    // Update conversations list
                    const newConversation = {
                        conversationId: 'group_' + createdGroup.guid,
                        conversationType: CometChat.RECEIVER_TYPE.GROUP,
                        lastMessage: null, // No messages yet
                        conversationWith: {
                            name: createdGroup.name,
                            guid: createdGroup.guid,
                            description: createdGroup.description,
                            avatar: createdGroup.icon, // Use the group's icon as the avatar
                        },
                    };
                    setConversations(prevConversations => [newConversation, ...prevConversations]);
    
                    setGroupName('');
                    setGroupDescription('');
                    setCreateGroup(false);
                    setLoading(false);
                }, error => {
                    console.log('Group creation failed with exception:', { error });
                });
            }
        }else
            alert('Please provide all required information');
    };
    

    useEffect(() => {
        if (!userloading && user) {
            const fetchConversations = async () => {
                try {
                    const limit = 50; // Set the limit for the number of conversations to fetch
                    const conversationRequest = new CometChat.ConversationsRequestBuilder()
                        .setLimit(limit)
                        .build();
    
                    const fetchedConversations = await conversationRequest.fetchNext();
                    console.log('Fetched conversations:', fetchedConversations);
                    setConversations(fetchedConversations);
                } catch (error) {
                    console.error('Error fetching conversations:', error);
                }
            };
    
            fetchConversations();
    
            // Set up event listener for real-time updates
            const listenerID = user.id;
            CometChat.addMessageListener(
                listenerID,
                new CometChat.MessageListener({
                    onTextMessageReceived: (message: any) => {
                        console.log('Text message received successfully:', message);
                        updateConversationList(message);
                        if(chatGroup.guid === message.receiverId){
                            setPreviousMessages((prevMessages: any[]) => [...prevMessages, message]);
                            CometChat.markAsRead(message.id, message.receiverId, message.receiverType, message.sender.uid);
                        }
                    },  
                    onMediaMessageReceived: (message: any) => {
                        console.log('Media message received successfully:', message);
                        updateConversationList(message);
                    },
                    onCustomMessageReceived: (message: any) => {
                        console.log('Custom message received successfully:', message);
                        updateConversationList(message);
                    },
                })
            );
    
            return () => {
                CometChat.removeMessageListener(listenerID);
            };
        }
    }, [user, userloading, createGroup, chatVisible]);

    const updateConversationList = (newMessage: any) => {
        setConversations(prevConversations => {
            const updatedConversations = prevConversations.map(conversation => {
                if (conversation.conversationId === newMessage.conversationId) {
                    conversation.lastMessage = newMessage;
                    conversation.conversationWith.lastMessage = newMessage;
                }
                return conversation;
            });
    
            const existingConversation = updatedConversations.find(conversation => conversation.conversationId === newMessage.conversationId);
            if (!existingConversation) {
                const newConversation = {
                    conversationId: newMessage.conversationId,
                    conversationType: newMessage.receiverType,
                    lastMessage: newMessage,
                    conversationWith: newMessage.receiverType === CometChat.RECEIVER_TYPE.GROUP ? newMessage.getReceiver() : newMessage.getSender(),
                };
                updatedConversations.unshift(newConversation);
            }
    
            updatedConversations.sort((a, b) => new Date(b.lastMessage.sentAt).getTime() - new Date(a.lastMessage.sentAt).getTime());
            return updatedConversations;
        });
    };

    const handleChatOpen = async (type: string, conversation: any) => {
        if (type === "group") {
            const GUID = conversation.guid;
            setChatGroup(conversation);
    
            const limit = 30;
            const messagesRequest = new CometChat.MessagesRequestBuilder().setGUID(GUID).setLimit(limit).build();

            const group = await CometChat.getGroup(GUID);
            console.log(group);
            setChatGroupInfo(group);

            const membersRequest = new CometChat.GroupMembersRequestBuilder(GUID).setLimit(100).build();
            const members = await membersRequest.fetchNext();
            console.log('Members:', members);
            setChatGroupMembers(members);

            // Fetch the messages and filter based on join date
            const messages = await messagesRequest.fetchPrevious();
            messages.filter((message: any) => {
                if (message.sender.uid !== user.id.toLowerCase())
                    CometChat.markAsRead(message.id, message.receiverId, message.receiverType, message.sender.uid);
            })
            
            setChatVisible(true);
            const member: any = members.find((member: any) => member.uid === user.id.toLowerCase());
            const userJoinDate = member?.joinedAt;
            if (userJoinDate) {
                const filteredUserMessages = messages.filter((message: any) => message.sentAt >= userJoinDate);
                filteredUserMessages.map(async(message: any) => {
                    if(message.category === 'message' && message.sender.uid === user.id.toLowerCase()){
                        const receiptRequest: any = await CometChat.getMessageReceipts(message.id);
                        console.log(message.text);
                        console.log(receiptRequest);
                        const readReceipts = receiptRequest.filter((receipt: any) => receipt.receiptType === 'read');
                        message.receiptStatus = readReceipts.length === receiptRequest.length ? 'read' : 'delivered';
                    }
                })
                setPreviousMessages(filteredUserMessages);
            } else {
                setPreviousMessages(messages);
            }
        }
    };

    const sendMessage = async () => {
        if (message && chatGroup) {
            const textMessage = new CometChat.TextMessage(chatGroup.guid, message, CometChat.RECEIVER_TYPE.GROUP);
            await CometChat.sendMessage(textMessage).then(sentMessage => {
                console.log('Message sent successfully:', { sentMessage });
                setPreviousMessages(prevMessages => [...prevMessages, sentMessage]);
                setMessage('');
                updateConversationList(sentMessage);
            }, error => {
                console.log('Message sending failed with exception:', { error });
            });
        }
    };

    return (
        <SafeAreaView style={{ backgroundColor: '#f6ffe2', flex: 1, position: 'relative' }} className="mb-[19.4%]">
            {user?.designation === 'head' && <TouchableOpacity className="bg-[#83a638] w-10 h-10 rounded-full absolute bottom-5 right-5 z-40" onPress={() => setCreateGroup(true)}><Text className="text-5xl text-center">+</Text></TouchableOpacity>}
            <ScrollView style={{ flex: 1 }}>
                {conversations.length > 0 ? conversations.map((conversation: any) => {
                    const lastMessage = conversation.lastMessage;
                    const sentAt = lastMessage ? new Date(lastMessage.sentAt * 1000) : null; // Multiplying by 1000 to convert seconds to milliseconds
                    const currentDate = new Date();

                    // Function to check if two dates are on the same day
                    const isSameDay = (date1: any, date2: any) => {
                        return date1.getDate() === date2.getDate() &&
                            date1.getMonth() === date2.getMonth() &&
                            date1.getFullYear() === date2.getFullYear();
                    };

                    return (
                        <TouchableOpacity
                            style={{ width: "100%", marginVertical: 5 }}
                            key={conversation.conversationId}
                            onPress={() => handleChatOpen(conversation.conversationType, conversation.conversationWith)}
                        >
                            <View className="flex-row w-full">
                                <TouchableOpacity className="w-1/5">
                                    <Image source={{ uri: conversation.conversationWith.icon }} style={{ height: 50, width: 50, zIndex: 40 }} className="self-center bg-black rounded-full " />
                                </TouchableOpacity>
                                <View className="w-3/5">
                                    <Text className="text-xl">{conversation.conversationWith.name}</Text>
                                    <Text>
                                        {lastMessage ? (lastMessage.text ? `${lastMessage.sender.uid === user.id.toLowerCase() ? 'You' : lastMessage.sender.name} : ${lastMessage.text}` : lastMessage.message) : ""}
                                    </Text>
                                </View>
                                <View className="w-1/5 flex-col justify-center">
                                    {sentAt && (
                                        isSameDay(sentAt, currentDate) ? (
                                            <Text className="text-center">{`${sentAt.getHours().toString().padStart(2, '0')}:${sentAt.getMinutes().toString().padStart(2, '0')}`}</Text>
                                        ) : (
                                            <Text className="text-center">{sentAt.toLocaleDateString()}</Text>
                                        )
                                    )}
                                    {conversation.unreadMessageCount > 0 && (
                                        <Text className="rounded-full bg-[#a0e50b] flex-shrink text-center self-center min-w-[20]">{conversation.unreadMessageCount}</Text>
                                    )}
                                </View>
                            </View>
                        </TouchableOpacity>
                    );
                }) : <Text className="self-center my-[60%] text-4xl text-[#134006]">No chats found</Text>}

            </ScrollView>
            <Modal
                animationType="slide"
                visible={chatVisible}
                onRequestClose={() => setChatVisible(false)}
            >
                {chatGroup && <View className="flex-row bg-[#f6ffe2] pb-2">
                    <TouchableOpacity className="w-1/4" onPress={() => setShowGroupInfo(true)}>
                        {chatGroup.icon && <Image source={{ uri: chatGroup.icon }} style={{ height: 50, width: 50, zIndex: 40 }} className="self-center bg-black rounded-full" />}
                    </TouchableOpacity>
                    <View className="w-3/4">
                        <Text className="text-xl">{chatGroup.name}</Text>
                        <Text>{chatGroup.membersCount} members</Text>
                    </View>
                </View>}    
                <View style={{ flex: 1, paddingBottom: 62, backgroundColor: '#f6ffe2' }}>
                    <ScrollView style={{ flex: 1, backgroundColor: '#f6ffe2' }}>
                        {previousMessages.length > 0 && previousMessages.map((message: any, index) => {
                            return (
                                <ScrollView key={index}>
                                    {message.action === 'added' && <View className="flex-row justify-center mb-2"><Text className="bg-green-400 text-center flex-shrink self-start p-1 rounded-lg">{message.message}</Text></View>}
                                    {message.action === 'joined' && <View className="flex-row justify-center mb-2"><Text className="bg-green-400 text-center flex-shrink self-start p-1 rounded-lg">{message.actionBy.name} was added to the group</Text></View>}
                                    {message.action === 'kicked' && <View className="flex-row justify-center mb-2"><Text className="bg-green-400 text-center flex-shrink self-start p-1 rounded-lg">{message.actionOn.name} was kicked out of the group</Text></View>}
                                    {message.category === 'message' && message.text && message.sender.uid === user.id.toLowerCase() && (
                                        <View className="flex-row justify-end mr-4 mb-2">
                                            <View className="flex-col max-w-[80%] bg-[#a0e50b] rounded-lg flex-shrink">
                                                <Text className="p-1 px-2 rounded-lg flex-row self-end">{message.text}</Text>
                                                <Text className="p-1 px-2 rounded-lg flex-row self-end">{`${new Date(message.sentAt * 1000).getHours().toString().padStart(2, '0')}:${new Date(message.sentAt * 1000).getMinutes().toString().padStart(2, '0')}`} <Text className={`${message.receiptStatus === 'read' ? 'text-blue-500' : ''}`}>{message.receiptStatus === 'read' ? '√√' : message.receiptStatus === 'delivered' ? '√√' : '√'}</Text></Text>
                                            </View>
                                        </View>
                                    )}
                                    {message.category === 'message' && message.text && message.sender.uid !== user.id.toLowerCase() && (
                                        <View className="flex-row justify-start ml-4 mb-2">
                                            <Image source={{ uri: message.sender.avatar }} style={{ height: 35, width: 35, marginRight: 5, marginTop: 5 }} className="rounded-full" />
                                            <View className="flex-col w-full ">
                                                <Text>{message.sender.name}</Text>
                                                <View className="flex-col max-w-[80%] bg-[#a0e50b] flex-shrink rounded-lg self-start">
                                                    <Text className="p-1 px-2 rounded-lg flex-row self-start">{message.text}</Text>
                                                    <Text className="p-1 px-2 rounded-lg flex-row self-end">{`${new Date(message.sentAt * 1000).getHours().toString().padStart(2, '0')}:${new Date(message.sentAt * 1000).getMinutes().toString().padStart(2, '0')}`}</Text>
                                                </View>
                                            </View>
                                        </View>
                                    )}
                                </ScrollView>
                            )
                        })}
                    </ScrollView>
                </View>
                <View className="bottom-0 absolute flex-row mb-2 rounded-full border h-[50px] w-[85%] self-center px-2 bg-[#f6ffe2]">
                    <TextInput placeholder="Type a message" value={message} onChangeText={text => setMessage(text)} className="w-4/5 px-2" />
                    <TouchableOpacity className="flex justify-center w-1/5 rounded-full"><TouchableOpacity className={`${message ? 'bg-[#a0e50b]' : ''} w-10 h-10 flex-col justify-center rounded-full self-end`} onPress={() => sendMessage()}><Image source={require('@/assets/images/send.png')} className="self-center" /></TouchableOpacity></TouchableOpacity>
                </View>
            </Modal>
            <Modal
                animationType="slide"
                transparent={true}
                visible={createGroup}
                onRequestClose={() => setCreateGroup(false)}
            >
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
                    <TextInput className="h-12 w-[80%] bg-white mb-5 rounded-xl px-4" placeholder="Group Name" value={groupName} onChangeText={text => setGroupName(text)} />
                    <TextInput className="h-12 w-[80%] bg-white mb-5 rounded-xl px-4" placeholder="Description" value={groupDescription} onChangeText={text => setGroupDescription(text)} />
                    <TouchableOpacity className="bg-black p-2 rounded-full" onPress={() => handleGroupCreation()}>
                        {!loading && <Text className="text-white text-xl">Create Group</Text>}
                        {loading && <ActivityIndicator size="large" color="#fff" />}
                    </TouchableOpacity>
                </View>
            </Modal>
            <Modal
                animationType="slide"
                visible={showGroupInfo}
                onRequestClose={() => setShowGroupInfo(false)}
            >
                {chatGroupInfo && <ScrollView className="flex-1 bg-[#f6ffe2]">
                    <View className="bg-[#83a638] pb-2">
                        {chatGroupInfo.icon && <Image source={{ uri: chatGroupInfo.icon }} className="h-40 w-40 self-center mt-4 bg-black rounded-full" />}
                        <Text className="text-3xl text-center">{chatGroupInfo.name}</Text>
                        <Text className="text-xl text-center">{chatGroupInfo.membersCount} members</Text>
                    </View>
                    <View className="mt-4 px-6 bg-[#83a638] py-1">
                        <Text className="text-2xl text-[#e6ffaf] mb-1">Group Description</Text>
                        <Text className="text-lg">{chatGroupInfo.description}</Text>
                    </View>
                    <Text className="bg-[#83a638] mt-4 px-6 min-h-12 text-lg py-1">
                        Created at {new Date(chatGroupInfo.createdAt * 1000).toLocaleString()} by {chatGroupMembers.find((member: any) => member.uid === chatGroupInfo.owner)?.name}
                    </Text>
                    <View className="mt-4 px-6 bg-[#83a638] py-1">
                        <Text className="text-2xl text-[#e6ffaf] mb-3">Members</Text>
                        {chatGroupMembers && chatGroupMembers.reverse().map((member: any) => (
                            <View className="flex-row mb-2">
                                <Image source={{ uri: member.avatar }} className="h-12 w-12 rounded-full self-center" />
                                <Text key={member.uid} className="text-lg w-3/5 ml-3 self-center">{member.name}</Text>
                                <Text className="text-lg text-[#e6ffaf] self-center">{member.scope === 'admin' && 'Admin'}</Text>
                            </View>
                        ))}
                    </View>
                </ScrollView>}
            </Modal>
        </SafeAreaView>
    )
}
