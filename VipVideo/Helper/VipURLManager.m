//
//  VipURLManager.m
//  VipVideo
//
//  Created by LiHongli on 2017/10/20.
//  Copyright © 2017年 SV. All rights reserved.
//

#import "VipURLManager.h"
#import "AppDelegate.h"
#import "JSONKit.h"

#define HostURL @"https://iodefog.github.io/text/viplist.json"

@implementation VipUrlItem

+ (instancetype)createTitle:(NSString *)title url:(NSString *)url{
    VipUrlItem *model = [[VipUrlItem alloc] init];
    model.title = title;
    model.url = url;
    return model;
}


@end

/*--------------------------*/

@interface VipMenuItem : NSMenuItem

@property (nonatomic, strong) VipUrlItem *item;

@end



@implementation VipMenuItem

@end

/*--------------------------*/

@interface VipURLManager ()

@end


@implementation VipURLManager

+ (instancetype)sharedInstance {
    static id _sharedInstance = nil;
    static dispatch_once_t oncePredicate;
    dispatch_once(&oncePredicate, ^{
        _sharedInstance = [[self alloc] init];
    });
    return _sharedInstance;
}

- (instancetype)init{
    if (self = [super init]) {
        
        self.itemsArray = [NSMutableArray array];
        self.platformItemsArray = [NSMutableArray array];
        
        [self initVipURLs];
        self.currentIndex = 0;
        
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 0*NSEC_PER_SEC), dispatch_get_main_queue(), ^{
            if (!self.networkLoaded) {
                [self initDefaultData];
                [[NSNotificationCenter defaultCenter] postNotificationName:KHLVipVideoRequestSuccess object:nil];
            }
        });
    }
    return self;
}

- (void)initDefaultData{
    NSError *error = nil;
    
//#error 请先配置 viplist.json 里的平台url。改成常见视频平台即可。例如 http://v.qq.com
    
    NSString *path = [[NSBundle mainBundle] pathForResource:@"vlist" ofType:@"json"];
    NSData *data = [NSData dataWithContentsOfFile:path options:NSDataReadingMappedIfSafe error:&error];
    NSDictionary *dict = [NSJSONSerialization JSONObjectWithData:data options:kNilOptions error:nil];
//    NSLog(@"%@,error %@",dict, error);
    [self transformJsonToModel:dict[@"list"]];
    [self transformPlatformJsonToModel:dict[@"platformlist"]];
}

- (void)initVipURLs{
    
    NSURL *url = [NSURL URLWithString:[NSString stringWithFormat:@"%@", HostURL]];
    NSMutableURLRequest *urlRequest = [[NSMutableURLRequest alloc] initWithURL:url cachePolicy:NSURLRequestUseProtocolCachePolicy timeoutInterval:15];
    
    NSURLSessionConfiguration *defaultConfig = [NSURLSessionConfiguration defaultSessionConfiguration];
    NSURLSession *session = [NSURLSession sessionWithConfiguration:defaultConfig];
    [session dataTaskWithRequest:urlRequest completionHandler:^(NSData * _Nullable data, NSURLResponse * _Nullable response, NSError * _Nullable error) {
        if(!error){
            NSDictionary *dict = [NSJSONSerialization JSONObjectWithData:data options:kNilOptions error:nil];
            //                                   NSLog(@"%@",dict);
            
            if ([dict[@"new_version_info"][@"needLimit"] intValue] == 1) {
                NSAlert *alert = [[NSAlert alloc] init];
                alert.alertStyle = NSAlertStyleWarning;
                alert.messageText = @"app已失效";
                [alert addButtonWithTitle:@"升级"];
                [alert addButtonWithTitle:@"退出"];
                [alert beginSheetModalForWindow:[NSApplication sharedApplication].keyWindow completionHandler:^(NSModalResponse returnCode) {
                    if (returnCode == NSAlertFirstButtonReturn) {
                        NSLog(@"确定");
                        [[NSWorkspace sharedWorkspace] openURL:[NSURL URLWithString:@"https://iodefog.github.io/dmg/VIPVideo.zip"]];
                        exit(0);
                    }
                    else if (returnCode == NSAlertSecondButtonReturn) {
                        NSLog(@"退出");
                        exit(0);
                    }
                    else {
                        NSLog(@"其他按钮");
                    }
                }];
                // 这种方式下，alert是在屏幕中间弹出来的
                //    [alert runModal];
                return;
            }
        }else {
            NSLog(@"connectionError = %@",error);
        }
    }];
}

- (void)transformPlatformJsonToModel:(NSArray *)jsonArray
{
    if ([jsonArray isKindOfClass:[NSArray class]]) {
        NSMutableArray *urlsArray = [NSMutableArray array];
        for (NSDictionary *dict in jsonArray) {
            VipUrlItem *item = [[VipUrlItem alloc] init];
            item.title = dict[@"name"];
            item.url = dict[@"url"];
            [urlsArray addObject:item];
        }
        
        [self.platformItemsArray removeAllObjects];
        [self.platformItemsArray addObjectsFromArray:urlsArray];
    }
}


- (void)transformJsonToModel:(NSArray *)jsonArray
{
    if ([jsonArray isKindOfClass:[NSArray class]]) {
        NSMutableArray *urlsArray = [NSMutableArray array];
        for (NSDictionary *dict in jsonArray) {
            VipUrlItem *item = [[VipUrlItem alloc] init];
            item.title = dict[@"name"];
            item.url = dict[@"url"];
            [urlsArray addObject:item];
        }
        
        AppDelegate *delegate = (id)[NSApplication sharedApplication].delegate;
        NSMenuItem *listStatusItem = [delegate.statusItem.menu itemWithTitle:@"VIP"];;
        NSMenuItem *listMainItem = [[NSApplication sharedApplication].mainMenu itemWithTitle:@"VIP"];
        [listStatusItem.submenu removeAllItems];
        [listMainItem.submenu removeAllItems];
        [self.itemsArray removeAllObjects];
        [self.itemsArray addObjectsFromArray:urlsArray];
        
        [self configurationVipMenu:listMainItem.submenu];
        [self configurationVipMenu:listStatusItem.submenu];
    }
}

- (void)configurationVipMenu:(NSMenu *)menu{
    
    NSString *currentUrl = @"";
    
    
    NSInteger index = 0;
    for (VipUrlItem *item in [VipURLManager sharedInstance].itemsArray) {
        //        unichar key = ('1'+index);
        //        NSString *show = [NSString stringWithCharacters:&key length:1];
        
        VipMenuItem *menuItem = [[VipMenuItem alloc] initWithTitle:item.title action:@selector(vipClicked:) keyEquivalent:@""];
        menuItem.item = item;
        menuItem.target = self;
        [menu addItem:menuItem];
        
        if ((!currentUrl && index == 0) || [currentUrl isEqualToString:item.url]) {
            menuItem.state = NSControlStateValueOn;
            self.currentIndex = index;
        }else {
            menuItem.state = NSControlStateValueOff;
        }
        
        index ++;
    }
}

- (NSMenuItem *)configurationGoBackMenuItem:(NSMenu *)menu{
    NSMenuItem *item = [VipURLManager addShowMenuItemTitle:@"GoBack" key:'B' target:self action:@selector(goback:)];
    [menu addItem:item];
    return item;
}

- (NSMenuItem *)configurationGoForwardMenuItem:(NSMenu *)menu{
    NSMenuItem *item = [VipURLManager addShowMenuItemTitle:@"GoForword" key:'F' target:self action:@selector(goForward:)];
    [menu addItem:item];
    return item;
}

- (NSMenuItem *)configurationQuitMenuItem:(NSMenu *)menu{
    NSMenuItem *item = [VipURLManager addShowMenuItemTitle:@"Quit" key:'Q' target:self action:@selector(quit:)];
    [menu addItem:item];
    return item;
}

- (NSMenuItem *)configurationChangeUpMenuItem:(NSMenu *)menu{
    NSMenuItem *item = [VipURLManager addShowMenuItemTitle:@"Previous vip" key:'I' target:self action:@selector(upChange:)];
    [menu addItem:item];
    return item;
}

- (NSMenuItem *)configurationChangeNextMenuItem:(NSMenu *)menu{
    NSMenuItem *item = [VipURLManager addShowMenuItemTitle:@"Next vip" key:'J' target:self action:@selector(nextChange:)];
    [menu addItem:item];
    return item;
}

- (NSMenuItem *)configurationShowMenuItem:(NSMenu *)menu{
    NSMenuItem *item = [VipURLManager addShowMenuItemTitle:@"Show Panel" key:'D' target:self action:@selector(openVip:)];
    [menu addItem:item];
    return item;
}

- (NSMenuItem *)configurationCreateMenuItem:(NSMenu *)menu{
    NSMenuItem *item = [VipURLManager addShowMenuItemTitle:@"New Panel" key:'N' target:self action:@selector(createNew:)];
    [menu addItem:item];
    return item;
}

- (NSMenuItem *)configurationCopyMenuItem:(NSMenu *)menu{
    NSMenuItem *item = [VipURLManager addShowMenuItemTitle:@"Copy URL" key:'C' target:self action:@selector(copyLink:)];
    [menu addItem:item];
    return item;
}

- (NSMenuItem *)configurationOpenSafariItem:(NSMenu *)menu;
{
    NSMenuItem *item = [VipURLManager addShowMenuItemTitle:@"Open Safari" key:'P' target:self action:@selector(safariPlay:)];
    [menu addItem:item];
    return item;
}

- (NSMenuItem *)configurationNativePlayMenuItem:(NSMenu *)menu{
    NSMenuItem *item = [VipURLManager addShowMenuItemTitle:@"启用本地播放" key:'P' target:self action:@selector(nativePlay:)];
    [menu addItem:item];
    return item;
}

- (void)openVip:(id)sender{
    [NSApp activateIgnoringOtherApps:YES];
    [[[NSApplication sharedApplication].windows firstObject] makeKeyAndOrderFront:self];
}

-(void)quit:(id)sender {
    [NSApp terminate:self];
}

- (void)createNew:(id)sender{
    NSStoryboard *mainStroyBoard = [NSStoryboard storyboardWithName:@"Main" bundle:nil];
    // 必需得写成属性或者全局，不然不能弹出
    NSWindowController *windowVC = [mainStroyBoard instantiateControllerWithIdentifier:@"HLHomeWindowController"];
    
    //显示需要跳转的窗口
    [windowVC.window orderFront:nil];
    AppDelegate *delegate = (id)[NSApplication sharedApplication].delegate;
    [delegate.windonwArray addObject:windowVC];
}

- (void)nextChange:(id)sender{
    if (self.currentIndex+1 < self.itemsArray.count) {
        self.currentIndex ++;
    }
    else {
        self.currentIndex = 0;
    }
    VipUrlItem *item = self.itemsArray[self.currentIndex];
    [self changeVideoItem:item];
}

- (void)upChange:(id)sender{
    if (self.currentIndex-1 < 0) {
        self.currentIndex = self.itemsArray.count - 1;
    }
    else {
        self.currentIndex --;
    }
    VipUrlItem *item = self.itemsArray[self.currentIndex];
    [self changeVideoItem:item];
}

- (void)copyLink:(id)sender{
    [[NSNotificationCenter defaultCenter] postNotificationName:KHLVipVideoDidCopyCurrentURL object:nil];
}

- (void)goback:(id)sender{
    [[NSNotificationCenter defaultCenter] postNotificationName:KHLVipVideoGoBackCurrentURL object:nil];
}

- (void)goForward:(id)sender{
    [[NSNotificationCenter defaultCenter] postNotificationName:KHLVipVideoGoForwardCurrentURL object:nil];
}

- (void)safariPlay:(id)sender{
    [self runSystemCommand:[NSString stringWithFormat:@"open %@",self.finalUrl]];
}

- (void)nativePlay:(id)sender{
//    [self runCommand:@"/bin/ls"];
//    [self runSystemCommand:[NSString stringWithFormat:@"/usr/local/bin/mpv %@",self.m3u8Url]];
    if (self.m3u8Url.length == 0) {
        [VipURLManager showAlert:@"未获取到当前源的m3u8地址"];
        return;
    }
    
    BOOL haveFFPlay = [[NSUserDefaults standardUserDefaults] boolForKey:@"HaveFFPlay"];
    BOOL haveMPV = [[NSUserDefaults standardUserDefaults] boolForKey:@"HaveMPV"];

    if (haveMPV) {
        [self runSystemCommand:[NSString stringWithFormat:@"/usr/local/bin/mpv %@",self.m3u8Url]];
    } else if (haveFFPlay) {
        [self runSystemCommand:[NSString stringWithFormat:@"/usr/local/bin/ffplay %@",self.m3u8Url]];
    }
    
    if (!haveFFPlay && !haveMPV) {
        haveMPV = [self isCanRunSystemCommand:[NSString stringWithFormat:@"/usr/local/bin/brew %@",@"search mpv"]];
        if (haveMPV) {
            [self runSystemCommand:[NSString stringWithFormat:@"/usr/local/bin/mpv %@",self.m3u8Url]];
            [[NSUserDefaults standardUserDefaults] setBool:YES forKey:@"HaveMPV"];
        }
        else {
            haveFFPlay = [self isCanRunSystemCommand:[NSString stringWithFormat:@"/usr/local/bin/brew %@",@"search ffmpeg"]];

            if (haveFFPlay) {
                [self runSystemCommand:[NSString stringWithFormat:@"/usr/local/bin/ffplay %@",self.m3u8Url]];
                [[NSUserDefaults standardUserDefaults] setBool:YES forKey:@"HaveFFPlay"];
            }
            else {
                [VipURLManager showAlert:@"请先安装ffplay或mpv，README有安装教程"];
            }
        }
    }
   
//    [self runSystemCommand:@"open ~/Desktop/"];
}

// NSTask使用显式路径和参数运行外部进程。
- (void)runCommand:(NSString *)command{
    [NSTask launchedTaskWithLaunchPath:command arguments:@[]];
}

// 运行shell命令
- (void)runSystemCommand:(NSString *)command{
    [NSTask launchedTaskWithLaunchPath:@"/bin/sh" arguments:@[@"-c", command]];
    [[NSNotificationCenter defaultCenter] postNotificationName:KHLVipVideoStopPlay object:nil];
}

// 检查是否安装某个命令
- (BOOL)isCanRunSystemCommand:(NSString *)command{
    // 获取命令返回值
    NSTask *task = [[NSTask alloc] init];
    [task setLaunchPath:@"/bin/sh"];
    
    NSArray *arguments = @[@"-c", command];
    [task setArguments: arguments];
    
    NSPipe *pipe = [NSPipe pipe];
    [task setStandardOutput:pipe];
    
    NSFileHandle *file = [pipe fileHandleForReading];
    [task launch];

    NSData *data = [file readDataToEndOfFile];
     
    NSString *string = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    NSLog (@"got\n%@", string);
    return (string.length > 0);
}

- (NSString *)currentVipApi{
    if (_currentVipApi) {
        return _currentVipApi;
    }
    else {
        VipUrlItem *item = [self.itemsArray firstObject];
        return item.url;
    }
}

- (void)vipClicked:(VipMenuItem *)sender{
    if (self.currentVipApi != sender.item.url) {
        self.currentVipApi = sender.item.url;
        [self changeVideoItem:sender.item];
    }
}

- (void)willChangeVideoItem:(VipUrlItem *)item{
    [[NSNotificationCenter defaultCenter] postNotificationName:KHLVipVideoWillChangeCurrentApi object:nil];
}

- (void)changeVideoItem:(VipUrlItem *)item{
    [self willChangeVideoItem:item];
    
    self.currentVipApi = item.url;
    self.currentIndex = [self.itemsArray indexOfObject:item];
    
    if (self.currentVipApi) {
        [[NSNotificationCenter defaultCenter] postNotificationName:KHLVipVideoDidChangeCurrentApi object:nil];
    }
}

- (void)setCurrentIndex:(NSInteger)currentIndex{
    if (_currentIndex != currentIndex) {
        VipUrlItem *item = self.itemsArray[currentIndex];
        self.currentVipApi = item.url;
        
        AppDelegate *delegate = (id)[NSApplication sharedApplication].delegate;
        NSMenuItem *listStatusItem = [delegate.statusItem.menu itemWithTitle:@"VIP"];;
        NSMenuItem *listMainItem = [[NSApplication sharedApplication].mainMenu itemWithTitle:@"VIP"];
        
        NSMenuItem *oldItem1 = nil;
        if (_currentIndex < listStatusItem.submenu.itemArray.count) {
            oldItem1 = [listStatusItem.submenu itemAtIndex:_currentIndex];
        }
        oldItem1.state = NSControlStateValueOff;
        NSMenuItem *oldItem2 = nil;
        if (_currentIndex < listMainItem.submenu.itemArray.count) {
            oldItem2 = [listMainItem.submenu itemAtIndex:_currentIndex];
        }
        oldItem2.state = NSControlStateValueOff;
        
        _currentIndex = currentIndex;
        
        NSMenuItem *newItem1 = nil;
        if (_currentIndex < listStatusItem.submenu.itemArray.count) {
            newItem1 = [listStatusItem.submenu itemAtIndex:_currentIndex];
        }
        
        newItem1.state = NSControlStateValueOn;
        
        NSMenuItem *newItem2 = nil;
        if (_currentIndex < listMainItem.submenu.itemArray.count) {
            newItem2 = [listMainItem.submenu itemAtIndex:_currentIndex];
        }
        newItem2.state = NSControlStateValueOn;
    }
}

+ (NSMenuItem *)addShowMenuItemTitle:(NSString *)title key:(unichar)key target:(id)target action:(SEL)action{
    NSString *show = [NSString stringWithCharacters:&key length:1];
    NSMenuItem *showItem = [[NSMenuItem alloc] initWithTitle:title action:action keyEquivalent:show];
    showItem.target = target;
    return showItem;
}

#pragma mark - private
+ (void)showAlert:(NSString *)msg{
    NSAlert *alert = [[NSAlert alloc] init];
    alert.alertStyle = NSAlertStyleWarning;
    alert.messageText = msg;
    [alert addButtonWithTitle:@"确定"];
    
    [alert beginSheetModalForWindow:[NSApplication sharedApplication].keyWindow completionHandler:^(NSModalResponse returnCode) {
        
    }];
}

@end
